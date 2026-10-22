package com.sogo.service;

import com.sogo.dto.ReservaDto;
import com.sogo.dto.ReservaDto.PagoDto;
import com.sogo.entity.MetodoPago;
import com.sogo.entity.Pago;
import com.sogo.entity.Reserva;
import com.sogo.repository.MetodoPagoRepository;
import com.sogo.repository.PagoRepository;
import com.sogo.repository.ReservaRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.CONFLICT;
import static org.springframework.http.HttpStatus.NOT_FOUND;

/**
 * Reservas de la tabla compartida con la web. Traduce entre los valores que
 * guarda la web (individual, piso1, CONFIRMADA...) y los que usa SOGO
 * (Individual, Piso 1, Confirmada...), sin cambiar cómo la web los escribe.
 */
@Service
public class ReservaService {

    private static final DateTimeFormatter MINUTO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");
    private static final String PAGO_APROBADO = "aprobado";

    private static final Map<String, String> TIPO = Map.of(
            "individual", "Individual", "familiar", "Grupo familiar",
            "grupal", "Grupo de trabajo", "pasadia", "Evento / Pasadía");
    private static final Map<String, String> ESTADO = Map.of(
            "PENDIENTE", "Pendiente", "CONFIRMADA", "Confirmada", "CANCELADA", "Cancelada",
            "COMPLETADA", "Finalizada", "NO_PRESENTADA", "No presentada");
    private static final Map<String, String> DOCUMENTO = Map.of(
            "CC", "Cédula de Ciudadanía", "CE", "Cédula de Extranjería", "PA", "Pasaporte",
            "TI", "Tarjeta de Identidad", "NIT", "NIT");

    private final ReservaRepository reservas;
    private final PagoRepository pagos;
    private final MetodoPagoRepository metodos;
    private final HabitacionService habitaciones;
    private final EntityManager em;
    private final ConfiguracionService config;

    public ReservaService(ReservaRepository reservas, PagoRepository pagos, MetodoPagoRepository metodos,
                          HabitacionService habitaciones, EntityManager em, ConfiguracionService config) {
        this.reservas = reservas;
        this.pagos = pagos;
        this.metodos = metodos;
        this.habitaciones = habitaciones;
        this.em = em;
        this.config = config;
    }

    // ── Lectura ──────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<ReservaDto> listar() {
        Map<Long, String> numeros = habitaciones.numerosPorId();
        Map<Integer, Set<Long>> porPiso = idsPorPiso();
        Map<Long, String> nombresMetodo = nombresMetodo();
        Map<Long, List<Pago>> pagosPorReserva = pagos.findByEstadoOrderByFechaPagoAsc(PAGO_APROBADO).stream()
                .collect(Collectors.groupingBy(Pago::getReservaId));
        return reservas.findAll().stream()
                .sorted(Comparator.comparing(Reserva::getId).reversed())
                .map(r -> toDto(r, numeros, porPiso, pagosPorReserva.getOrDefault(r.getId(), List.of()), nombresMetodo))
                .toList();
    }

    @Transactional(readOnly = true)
    public ReservaDto obtener(Long id) {
        Reserva r = buscar(id);
        return toDto(r, habitaciones.numerosPorId(), idsPorPiso(),
                pagos.findByReservaIdAndEstadoOrderByFechaPagoAsc(id, PAGO_APROBADO), nombresMetodo());
    }

    // ── Escritura ────────────────────────────────────────

    /**
     * Crea la reserva con su abono inicial en una sola transacción: si el pago no se puede
     * guardar, tampoco queda la reserva. Con el abono exigido (Configuración › Alojamiento ›
     * Abono para confirmar) queda «Confirmada»; sin él, «Pendiente».
     */
    @Transactional
    public synchronized ReservaDto crear(ReservaDto d, Long usuarioId) {
        Reserva r = new Reserva();
        r.setFechaCreacion(LocalDateTime.now());
        r.setCreadoPor(usuarioId);
        aplicar(r, d);
        reservas.saveAndFlush(r);
        em.refresh(r);   // trae el código RSV-… que pone el trigger
        for (PagoDto p : d.payments() == null ? List.<PagoDto>of() : d.payments()) {
            if (p.amount() > 0) guardarPago(r, p, usuarioId);
        }
        confirmarSiCorresponde(r);
        return obtener(r.getId());
    }

    /** Reemplaza los datos editables con los de `d` (los pagos van aparte, en registrarPago). */
    @Transactional
    public synchronized ReservaDto actualizar(Long id, ReservaDto d) {
        Reserva r = buscar(id);
        aplicar(r, d);
        long pagado = pagado(id);
        if (aCobrar(r) < pagado) throw new ResponseStatusException(BAD_REQUEST,
                "El total de la reserva (" + pesos(aCobrar(r)) + ") no puede ser menor que lo ya pagado (" + pesos(pagado) + ")");
        confirmarSiCorresponde(r);
        return obtener(id);
    }

    /** Pago de la reserva (recepción, check-out o factura). Si completa el abono, la reserva se confirma. */
    @Transactional
    public ReservaDto registrarPago(Long reservaId, PagoDto p, Long usuarioId) {
        Reserva r = buscar(reservaId);
        guardarPago(r, p, usuarioId);
        confirmarSiCorresponde(r);
        return obtener(reservaId);
    }

    private void guardarPago(Reserva r, PagoDto p, Long usuarioId) {
        Long reservaId = r.getId();
        if (p.amount() <= 0) throw new ResponseStatusException(BAD_REQUEST, "El valor del pago debe ser mayor que cero");
        String estado = nz(r.getEstado()).toUpperCase();
        if (estado.equals("CANCELADA") || estado.equals("NO_PRESENTADA")) throw new ResponseStatusException(BAD_REQUEST, "La reserva está " + ESTADO.get(estado).toLowerCase() + ": no recibe pagos");
        long saldo = aCobrar(r) - pagado(reservaId);
        if (p.amount() > saldo) throw new ResponseStatusException(BAD_REQUEST,
                "El pago (" + pesos(p.amount()) + ") supera el saldo de la reserva (" + pesos(Math.max(0, saldo)) + ")");
        Pago pago = new Pago();
        pago.setReservaId(reservaId);
        pago.setUsuarioId(usuarioId);
        pago.setMetodoPagoId(metodoPorNombre(p.method()).getId());
        pago.setMonto(BigDecimal.valueOf(p.amount()));
        pago.setEstado(PAGO_APROBADO);
        LocalDateTime fecha = fechaHora(p.date());
        pago.setFechaPago(fecha != null ? fecha : LocalDateTime.now());
        pago.setFechaCreacion(LocalDateTime.now());
        pago.setComprobante(p.receipt());
        pago.setOrigen("SOGO");
        pagos.saveAndFlush(pago);
    }

    // ── Fechas y disponibilidad ──────────────────────────

    private static final Set<String> SIN_OCUPACION = Set.of("CANCELADA", "NO_PRESENTADA", "COMPLETADA");

    /**
     * Valida la reserva (las directas de SOGO; las de la web pasan por aquí cuando se editan):
     *  · la salida es posterior a la entrada (una pasadía empieza y termina el mismo día);
     *  · una reserva nueva no empieza en el pasado;
     *  · ninguna otra reserva vigente usa las mismas habitaciones en fechas que se cruzan.
     * Al editar solo se revisa la disponibilidad si cambiaron las fechas o las habitaciones,
     * para no bloquear el check-in o el pago de una reserva por datos antiguos.
     */
    private void validarFechasYDisponibilidad(Reserva r, boolean nueva, LocalDate antesIn, LocalDate antesOut, Set<Long> antesHab) {
        LocalDate in = r.getFechaIngreso(), out = r.getFechaSalida();
        boolean pasadia = "pasadia".equals(r.getTipoReserva());
        if (out.isBefore(in) || (!pasadia && !out.isAfter(in)))
            throw new ResponseStatusException(BAD_REQUEST, pasadia ? "La salida no puede ser antes de la entrada" : "La salida debe ser al menos un día después de la entrada");
        if (nueva && in.isBefore(LocalDate.now())) throw new ResponseStatusException(BAD_REQUEST, "La fecha de entrada no puede estar en el pasado");
        if (SIN_OCUPACION.contains(nz(r.getEstado()).toUpperCase())) return;

        Map<Integer, Set<Long>> porPiso = idsPorPiso();
        Set<Long> todas = todasLasHabitaciones();
        Set<Long> mias = habitacionesDe(r, porPiso, todas);
        if (mias.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "Selecciona al menos una habitación");
        if (!nueva && in.equals(antesIn) && out.equals(antesOut) && mias.equals(antesHab)) return;

        Map<Long, String> numeros = habitaciones.numerosPorId();
        for (Reserva o : reservas.findAll()) {
            if (Objects.equals(o.getId(), r.getId()) || o.getFechaIngreso() == null || o.getFechaSalida() == null) continue;
            if (SIN_OCUPACION.contains(nz(o.getEstado()).toUpperCase())) continue;
            if (!seCruzan(in, finOcupacion(in, out), o.getFechaIngreso(), finOcupacion(o.getFechaIngreso(), o.getFechaSalida()))) continue;
            Set<Long> comunes = new TreeSet<>(habitacionesDe(o, porPiso, todas));
            comunes.retainAll(mias);
            if (comunes.isEmpty()) continue;
            String hab = comunes.stream().map(id -> numeros.getOrDefault(id, String.valueOf(id))).sorted().collect(Collectors.joining(", "));
            throw new ResponseStatusException(CONFLICT, (comunes.size() == 1 ? "La habitación " + hab + " ya está reservada" : "Las habitaciones " + hab + " ya están reservadas")
                    + " del " + o.getFechaIngreso().format(DIA) + " al " + o.getFechaSalida().format(DIA)
                    + " (" + (o.getCodigo() != null ? o.getCodigo() : "reserva " + o.getId()) + ")");
        }
    }

    private static final DateTimeFormatter DIA = DateTimeFormatter.ofPattern("dd/MM/yyyy");

    /** Día en que se libera: el de salida; una pasadía ocupa su día completo. */
    private static LocalDate finOcupacion(LocalDate in, LocalDate out) {
        return out.isAfter(in) ? out : in.plusDays(1);
    }

    /** [in1, out1) y [in2, out2) se cruzan. La salida y la entrada del mismo día no se cruzan. */
    private static boolean seCruzan(LocalDate in1, LocalDate out1, LocalDate in2, LocalDate out2) {
        return in1.isBefore(out2) && in2.isBefore(out1);
    }

    /** Habitaciones que ocupa una reserva: las elegidas, todo un piso o la casa completa (también las de la web). */
    private Set<Long> habitacionesDe(Reserva r, Map<Integer, Set<Long>> porPiso, Set<Long> todas) {
        Set<Long> ids = new TreeSet<>(r.getHabitacionesIds());
        if (r.getHabitacionId() != null) ids.add(r.getHabitacionId());
        String modo = nz(r.getModoEspacio()), espacio = nz(r.getEspacio());
        if (modo.equals("casa") || (ids.isEmpty() && espacio.equals("completo"))) ids.addAll(todas);
        else if ((modo.equals("piso") || ids.isEmpty()) && espacio.matches("piso\\d+")) ids.addAll(porPiso.getOrDefault(Integer.valueOf(espacio.substring(4)), Set.of()));
        return ids;
    }

    private Map<Integer, Set<Long>> idsPorPiso() {
        Map<String, Long> ids = habitaciones.idsPorNumero();
        Map<Integer, Set<Long>> out = new HashMap<>();
        habitaciones.pisosPorNumero().forEach((num, piso) -> { if (ids.get(num) != null) out.computeIfAbsent(piso, k -> new TreeSet<>()).add(ids.get(num)); });
        return out;
    }

    private Set<Long> todasLasHabitaciones() {
        return new TreeSet<>(habitaciones.idsPorNumero().values());
    }

    // ── Reglas de cobro ──────────────────────────────────

    /** Total de la reserva: alojamiento + servicios adicionales. */
    private static long total(Reserva r) {
        return (r.getPrecioTotal() == null ? 0 : Math.round(r.getPrecioTotal())) + (r.getValorExtras() == null ? 0 : r.getValorExtras().longValue());
    }

    /**
     * Lo que se le cobra al huésped: el total de la reserva o, si ya tiene factura vigente
     * (emitida y sin anular), el total de la factura, que incluye los impuestos.
     */
    private long aCobrar(Reserva r) {
        Object f = em.createNativeQuery("SELECT COALESCE(SUM(ROUND(l.cantidad * l.valor_unitario * (1 - l.descuento_pct / 100)) "
                        + "+ ROUND(ROUND(l.cantidad * l.valor_unitario * (1 - l.descuento_pct / 100)) * l.tarifa_impuesto)), 0) "
                        + "FROM factura_lineas l JOIN facturas f ON f.id = l.factura_id "
                        + "WHERE f.reserva_id = ? AND f.estado_dian <> 'Borrador' AND f.nota_credito IS NULL AND l.incluida = 1")
                .setParameter(1, r.getId()).getSingleResult();
        long factura = f == null ? 0 : ((Number) f).longValue();
        return Math.max(total(r), factura);
    }

    /** Lo pagado: los pagos aprobados (los de SOGO y los de la web con Wompi). */
    private long pagado(Long reservaId) {
        return pagos.findByReservaIdAndEstadoOrderByFechaPagoAsc(reservaId, PAGO_APROBADO).stream()
                .mapToLong(x -> x.getMonto() == null ? 0 : x.getMonto().longValue()).sum();
    }

    /**
     * Una reserva «Pendiente» pasa a «Confirmada» cuando lo pagado cubre el abono exigido
     * (porcentaje de configuracion 'politicas_reserva', redondeado a miles como en pantalla).
     * Nunca la devuelve a pendiente: confirmar a mano sin abono sigue siendo posible.
     */
    private void confirmarSiCorresponde(Reserva r) {
        if (!"PENDIENTE".equalsIgnoreCase(nz(r.getEstado()))) return;
        Optional<Integer> pct = config.leer("politicas_reserva").map(v -> v.path("depositPct")).filter(n -> n.isNumber()).map(n -> n.asInt());
        if (pct.isEmpty()) return;   // sin política guardada no se decide nada por el usuario
        long total = total(r);
        long abono = Math.round(total * pct.get() / 100.0 / 1000.0) * 1000;
        if (total > 0 && pagado(r.getId()) >= abono) {
            r.setEstado("CONFIRMADA");
            r.setFechaModificacion(LocalDateTime.now());
            reservas.saveAndFlush(r);
        }
    }

    private static String pesos(long v) {
        return "$ " + String.format(Locale.ROOT, "%,d", v).replace(',', '.');
    }

    private Reserva buscar(Long id) {
        return reservas.findById(id).orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "No existe la reserva " + id));
    }

    private MetodoPago metodoPorNombre(String nombre) {
        String n = nombre == null || nombre.isBlank() ? "Efectivo" : nombre.trim();
        return metodos.findByNombreIgnoreCase(n).orElseGet(() -> metodos.save(new MetodoPago(n)));
    }

    private Map<Long, String> nombresMetodo() {
        return metodos.findAll().stream().collect(Collectors.toMap(MetodoPago::getId, MetodoPago::getNombre));
    }

    // ── SOGO → tabla ─────────────────────────────────────

    private void aplicar(Reserva r, ReservaDto d) {
        if (d.guestName() == null || d.guestName().isBlank()) throw new ResponseStatusException(BAD_REQUEST, "Falta el nombre del huésped");
        if (d.checkIn() == null || d.checkOut() == null || d.checkIn().isBlank() || d.checkOut().isBlank()) throw new ResponseStatusException(BAD_REQUEST, "Faltan las fechas de la reserva");
        boolean nueva = r.getId() == null;
        LocalDate antesIn = r.getFechaIngreso(), antesOut = r.getFechaSalida();
        Set<Long> antesHab = nueva ? Set.of() : habitacionesDe(r, idsPorPiso(), todasLasHabitaciones());

        // Nombres y apellidos en sus columnas (igual que la web). Si solo llega el nombre completo
        // (versiones anteriores), se conserva lo que había mientras no cambie.
        String nombres = nz(d.firstName()).trim().replaceAll("\\s+", " ");
        String apellidos = nz(d.lastName()).trim().replaceAll("\\s+", " ");
        if (!nombres.isEmpty()) {
            if (apellidos.isEmpty()) throw new ResponseStatusException(BAD_REQUEST, "Faltan los apellidos del huésped");
            r.setNombreHuesped(nombres);
            r.setApellidoHuesped(apellidos);
        } else {
            String nombreActual = (nz(r.getNombreHuesped()) + " " + nz(r.getApellidoHuesped())).trim();
            if (!d.guestName().trim().equals(nombreActual)) {
                r.setNombreHuesped(d.guestName().trim());
                r.setApellidoHuesped(null);
            }
        }
        r.setTipoDocumento(clave(DOCUMENTO, d.docType()));
        r.setNumeroDocumento(d.docNumber());
        String telefonoActual = (nz(r.getCodigoPais()) + " " + nz(r.getTelefonoContacto())).trim();
        if (!nz(d.phone()).trim().equals(telefonoActual)) {
            r.setCodigoPais(null);
            r.setTelefonoContacto(d.phone());
        }
        r.setEmailContacto(d.email());
        r.setCiudad(d.city());

        r.setTipoReserva(clave(TIPO, d.reservationType()));
        r.setCanal(d.channel() == null || d.channel().isBlank() ? "Directo" : d.channel());
        r.setPlan(d.plan());

        // Espacio y habitaciones
        Map<String, Long> ids = habitaciones.idsPorNumero();
        Map<String, Integer> pisos = habitaciones.pisosPorNumero();
        List<Long> elegidas = new ArrayList<>();
        Set<Integer> pisosElegidos = new TreeSet<>();
        for (String numero : d.rooms() == null ? List.<String>of() : d.rooms()) {
            Long id = ids.get(numero);
            if (id == null) throw new ResponseStatusException(BAD_REQUEST, "No existe la habitación " + numero);
            if (!elegidas.contains(id)) elegidas.add(id);
            if (pisos.get(numero) != null) pisosElegidos.add(pisos.get(numero));
        }
        String tipo = nz(d.lodgingType());
        r.setModoEspacio(tipo.equals("Casa completa") ? "casa" : tipo.equals("Piso") ? "piso" : "habitaciones");
        // `espacio` también lo usa la web para la tarifa por habitaciones: piso1, piso2 o completo según los pisos elegidos
        if (tipo.equals("Casa completa") || pisosElegidos.size() > 1) r.setEspacio("completo");
        else if (tipo.equals("Piso") && d.floor() != null) r.setEspacio("piso" + d.floor());
        else if (!pisosElegidos.isEmpty()) r.setEspacio("piso" + pisosElegidos.iterator().next());
        r.getHabitacionesIds().clear();
        r.getHabitacionesIds().addAll(elegidas);
        r.setHabitacionId(elegidas.size() == 1 ? elegidas.get(0) : null);

        // Personas: la web separa niños de 3–10 (ninos10) y de 11+ (ninos11); se conserva si no cambió el total
        r.setHuespedes(d.adults());
        r.setNinos3(d.infants());
        if (r.getNinos10() == null || d.children() != nz(r.getNinos10()) + nz(r.getNinos11())) {
            r.setNinos10(d.children());
            r.setNinos11(0);
        }

        r.setFechaIngreso(LocalDate.parse(d.checkIn()));
        r.setFechaSalida(LocalDate.parse(d.checkOut()));
        r.setNoches(d.nights());
        r.setPrecioTotal((double) d.lodgingAmount());
        r.setPrecioNoche(d.nights() > 0 ? (double) d.lodgingAmount() / d.nights() : (double) d.lodgingAmount());
        r.setValorExtras(BigDecimal.valueOf(d.extrasAmount()));

        r.setEstado(clave(ESTADO, d.status()));
        validarFechasYDisponibilidad(r, nueva, antesIn, antesOut, antesHab);
        r.setCheckinAt(fechaHora(d.checkedInAt()));
        r.setCheckoutAt(fechaHora(d.checkedOutAt()));
        r.setObservaciones(d.observations());
        r.setMotivoCancelacion(d.cancelReason());
        r.setConsentimientoDatosAt(fechaHora(d.dataConsentAt()));
        r.setFechaModificacion(LocalDateTime.now());
    }

    // ── Tabla → SOGO ─────────────────────────────────────

    private ReservaDto toDto(Reserva r, Map<Long, String> numeros, Map<Integer, Set<Long>> porPiso, List<Pago> pagosReserva, Map<Long, String> nombresMetodo) {
        List<String> rooms = habitacionesDe(r, porPiso, new TreeSet<>(numeros.keySet())).stream()
                .map(numeros::get).filter(Objects::nonNull).distinct().sorted().toList();

        String modo = nz(r.getModoEspacio());
        String lodgingType = modo.equals("casa") ? "Casa completa" : modo.equals("piso") ? "Piso" : "Habitación";
        Integer floor = lodgingType.equals("Piso") && nz(r.getEspacio()).matches("piso\\d+")
                ? Integer.valueOf(r.getEspacio().substring(4)) : null;

        List<PagoDto> payments = pagosReserva.stream().map(p -> new PagoDto(
                texto(p.getFechaPago() != null ? p.getFechaPago() : p.getFechaCreacion()),
                p.getMetodoPagoId() != null ? nombresMetodo.getOrDefault(p.getMetodoPagoId(), "Efectivo") : "Wompi",
                p.getMonto() == null ? 0 : p.getMonto().longValue(),
                p.getComprobante() != null ? p.getComprobante() : nz(p.getNumeroTransaccion()))).toList();

        String telefono = (nz(r.getCodigoPais()) + " " + nz(r.getTelefonoContacto())).trim();
        String creada = texto(r.getFechaCreacion() != null ? r.getFechaCreacion() : LocalDateTime.now());

        return new ReservaDto(
                String.valueOf(r.getId()),
                r.getCodigo() != null ? r.getCodigo() : "RSV-" + r.getId(),
                (nz(r.getNombreHuesped()) + " " + nz(r.getApellidoHuesped())).trim(),
                DOCUMENTO.getOrDefault(nz(r.getTipoDocumento()), nz(r.getTipoDocumento())),
                nz(r.getNumeroDocumento()),
                telefono,
                nz(r.getEmailContacto()),
                r.getCiudad() != null ? r.getCiudad() : nz(r.getPais()),
                TIPO.getOrDefault(nz(r.getTipoReserva()), "Individual"),
                r.getCanal() != null ? r.getCanal() : "Web",
                lodgingType, floor, rooms,
                nz(r.getHuespedes()), nz(r.getNinos10()) + nz(r.getNinos11()), nz(r.getNinos3()),
                r.getFechaIngreso() != null ? r.getFechaIngreso().toString() : "",
                r.getFechaSalida() != null ? r.getFechaSalida().toString() : "",
                nz(r.getNoches()),
                nz(r.getPlan()),
                r.getPrecioTotal() == null ? 0 : Math.round(r.getPrecioTotal()),
                r.getValorExtras() == null ? 0 : r.getValorExtras().longValue(),
                payments,
                ESTADO.getOrDefault(nz(r.getEstado()).toUpperCase(), "Pendiente"),
                texto(r.getCheckinAt()), texto(r.getCheckoutAt()),
                nz(r.getObservaciones()),
                creada,
                r.getFechaModificacion() != null ? texto(r.getFechaModificacion()) : creada,
                r.getMotivoCancelacion(),
                texto(r.getConsentimientoDatosAt()),
                nz(r.getNombreHuesped()).trim(),
                nz(r.getApellidoHuesped()).trim());
    }

    // ── Utilidades ───────────────────────────────────────

    /** Valor de SOGO → clave que guarda la web (si no está en el mapa, se guarda tal cual). */
    private static String clave(Map<String, String> mapa, String valor) {
        if (valor == null) return null;
        return mapa.entrySet().stream().filter(e -> e.getValue().equals(valor)).map(Map.Entry::getKey).findFirst().orElse(valor);
    }

    private static LocalDateTime fechaHora(String s) {
        if (s == null || s.isBlank()) return null;
        return LocalDateTime.parse(s.length() > 16 ? s.substring(0, 16) : s, MINUTO);
    }

    private static String texto(LocalDateTime t) {
        return t == null ? null : t.format(MINUTO);
    }

    private static String nz(String s) { return s == null ? "" : s; }
    private static int nz(Integer i) { return i == null ? 0 : i; }
}
