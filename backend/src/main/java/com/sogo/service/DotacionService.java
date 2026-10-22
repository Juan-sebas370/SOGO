package com.sogo.service;

import com.sogo.dto.DotacionDto;
import com.sogo.entity.Dotacion;
import com.sogo.entity.Dotacion.CantidadPiso;
import com.sogo.repository.DotacionRepository;
import jakarta.persistence.EntityManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;

import static org.springframework.http.HttpStatus.BAD_REQUEST;
import static org.springframework.http.HttpStatus.NOT_FOUND;

@Service
public class DotacionService {

    public static final List<String> CATEGORIAS = List.of(
            "Muebles y enseres", "Lencería", "Equipos eléctricos y de comunicación", "Dotación de cocina", "Amenities");
    private static final DateTimeFormatter MINUTO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");

    private final DotacionRepository dotacion;
    private final EntityManager em;

    public DotacionService(DotacionRepository dotacion, EntityManager em) {
        this.dotacion = dotacion;
        this.em = em;
    }

    @Transactional(readOnly = true)
    public List<DotacionDto> listar() {
        return dotacion.findAll().stream()
                .filter(d -> !Boolean.FALSE.equals(d.getActivo()))
                .sorted(Comparator.comparingInt((Dotacion d) -> posicion(d.getCategoria()))
                        .thenComparing(d -> d.getOrden() == null ? 0 : d.getOrden()))
                .map(this::toDto).toList();
    }

    @Transactional(readOnly = true)
    public Dotacion buscar(Long id) {
        return dotacion.findById(id).orElseThrow(() -> new ResponseStatusException(NOT_FOUND, "No existe el artículo " + id));
    }

    @Transactional
    public DotacionDto crear(DotacionDto d, Long usuarioId) {
        Dotacion nuevo = new Dotacion();
        nuevo.setActivo(true);
        nuevo.setOrden(999);
        aplicar(nuevo, d, usuarioId);
        return toDto(dotacion.save(nuevo));
    }

    @Transactional
    public DotacionDto actualizar(Long id, DotacionDto d, Long usuarioId) {
        Dotacion item = buscar(id);
        BigDecimal antes = item.getPrecioUnitario();
        aplicar(item, d, usuarioId);
        if (antes.compareTo(item.getPrecioUnitario()) != 0) {
            em.createNativeQuery("INSERT INTO historial_cambios (entidad, entidad_id, usuario_id, campo, antes, despues, texto) "
                            + "VALUES ('dotacion', ?, ?, 'precio_unitario', ?, ?, ?)")
                    .setParameter(1, id).setParameter(2, usuarioId)
                    .setParameter(3, antes.toPlainString()).setParameter(4, item.getPrecioUnitario().toPlainString())
                    .setParameter(5, "Precio de " + item.getNombre() + ": " + antes.toBigInteger() + " -> " + item.getPrecioUnitario().toBigInteger())
                    .executeUpdate();
        }
        return toDto(item);
    }

    /** Lo retira del catálogo sin borrarlo (los cobros viejos siguen apuntando a él). */
    @Transactional
    public void retirar(Long id, Long usuarioId) {
        Dotacion item = buscar(id);
        item.setActivo(false);
        item.setModificadoPor(usuarioId);
    }

    private void aplicar(Dotacion item, DotacionDto d, Long usuarioId) {
        if (d.name() == null || d.name().isBlank()) throw new ResponseStatusException(BAD_REQUEST, "Falta el nombre del artículo");
        if (!CATEGORIAS.contains(d.category())) throw new ResponseStatusException(BAD_REQUEST, "Categoría no válida: " + d.category());
        if (d.unitPrice() < 0) throw new ResponseStatusException(BAD_REQUEST, "El precio no puede ser negativo");
        item.setCategoria(d.category());
        item.setNombre(d.name().trim());
        item.setPrecioUnitario(BigDecimal.valueOf(d.unitPrice()));
        item.setCobrable(d.chargeable());
        item.setModificadoPor(usuarioId);
        if (d.floors() != null) {
            item.getCantidades().clear();
            for (DotacionDto.Floor f : d.floors()) {
                if (f.quantity() < 0) throw new ResponseStatusException(BAD_REQUEST, "La cantidad no puede ser negativa");
                item.getCantidades().add(new CantidadPiso(f.floor(), BigDecimal.valueOf(f.quantity()),
                        f.annualUse() == null ? null : BigDecimal.valueOf(f.annualUse())));
            }
        }
    }

    private DotacionDto toDto(Dotacion d) {
        return new DotacionDto(
                d.getId(), d.getCategoria(), d.getNombre(),
                d.getPrecioUnitario() == null ? 0 : d.getPrecioUnitario().longValue(),
                !Boolean.FALSE.equals(d.getCobrable()),
                d.getOrden() == null ? 0 : d.getOrden(),
                d.getCantidades().stream().map(c -> new DotacionDto.Floor(c.getPiso(),
                        c.getCantidad() == null ? 0 : c.getCantidad().doubleValue(),
                        c.getConsumoAnual() == null ? null : c.getConsumoAnual().doubleValue())).toList(),
                d.getFechaModificacion() == null ? null : d.getFechaModificacion().format(MINUTO));
    }

    private static int posicion(String categoria) {
        int i = CATEGORIAS.indexOf(categoria);
        return i < 0 ? CATEGORIAS.size() : i;
    }
}
