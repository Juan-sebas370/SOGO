import { SireMovementType } from './tra.model';
import { SireCodes } from './sire-file';
import { DANE_CODES } from '../shared/divipola';

// Códigos del «paquete de guía» del SIRE · Alojamiento y Hospedaje (Migración Colombia):
// «PASOS PARA REPORTAR LA INFORMACION MEDIANTE ARCHIVO.docx», «Codigos Paises.xls» y
// «Codigo Ciudades Colombia.xlsx». Si Migración cambia el paquete, se actualiza aquí.

/** Tipo de documento: pasaporte 3, cédula de extranjería 5, documento extranjero (Mercosur y CAN) 10, PPT 52. */
export const SIRE_DOC_CODES: Record<string, string> = { PA: '3', CE: '5', DNI: '10', PPT: '52' };

/** Movimiento: solo la inicial. */
export const SIRE_MOVEMENT_CODES: Record<SireMovementType, string> = { ENTRADA: 'E', SALIDA: 'S' };

/**
 * País (ISO alfa-2 de SOGO) → código de país del SIRE (no es el ISO). Los que difieren de nombre se
 * cruzaron a mano: Bosnia, Guinea-Bissau, Iraq, Islas Vírgenes Estadounidenses, República de
 * Macedonia, Rwanda; Caribe Neerlandés → Antillas Neerlandesas. Sin código en el SIRE: San Martín
 * (Sint Maarten) y Sudán del Sur (se reportan por formulario).
 */
export const SIRE_COUNTRY_CODES: Record<string, string> = {
  AD: '37', // ANDORRA
  AE: '244', // EMIRATOS ARABES UNIDOS
  AF: '13', // AFGANISTAN
  AG: '43', // ANTIGUA Y BARBUDA
  AL: '17', // ALBANIA
  AM: '65', // ARMENIA
  AO: '40', // ANGOLA
  AR: '63', // ARGENTINA
  AT: '72', // AUSTRIA
  AU: '69', // AUSTRALIA
  AW: '67', // ARUBA
  AZ: '75', // AZERBAIYAN
  BA: '99', // BOSNIA
  BB: '83', // BARBADOS
  BD: '81', // BANGLADESH
  BE: '87', // BELGICA
  BF: '113', // BURKINA FASO
  BG: '111', // BULGARIA
  BH: '80', // BAHREIN
  BI: '115', // BURUNDI
  BJ: '89', // BENIN
  BM: '90', // BERMUDAS
  BN: '108', // BRUNEI
  BO: '97', // BOLIVIA
  BQ: '44', // ANTILLAS NEERLANDESAS
  BR: '105', // BRASIL
  BS: '77', // BAHAMAS
  BT: '117', // BUTAN
  BW: '101', // BOTSWANA
  BY: '85', // BIELORRUSIA
  BZ: '88', // BELICE
  CA: '149', // CANADA
  CD: '177', // REPUBLICA DEMOCRATICA DEL CONGO
  CF: '998', // REPUBLICA CENTROAFRICANA
  CG: '170', // REPUBLICA DEL CONGO
  CH: '767', // SUIZA
  CI: '193', // COSTA DE MARFIL
  CL: '211', // CHILE
  CM: '145', // CAMERUN
  CN: '215', // CHINA
  CO: '169', // COLOMBIA
  CR: '196', // COSTA RICA
  CU: '199', // CUBA
  CV: '127', // CABO VERDE
  CW: '201', // CURAZAO
  CY: '221', // CHIPRE
  CZ: '207', // REPUBLICA CHECA
  DE: '23', // ALEMANIA
  DJ: '920', // YIBUTI
  DK: '232', // DINAMARCA
  DM: '235', // DOMINICA
  DO: '647', // REPUBLICA DOMINICANA
  DZ: '59', // ARGELIA
  EC: '239', // ECUADOR
  EE: '251', // ESTONIA
  EG: '240', // EGIPTO
  ER: '246', // ERITREA
  ES: '245', // ESPAÑA
  ET: '253', // ETIOPIA
  FI: '271', // FINLANDIA
  FJ: '255', // FIYI
  FM: '503', // MICRONESIA
  FR: '275', // FRANCIA
  GA: '281', // GABON
  GB: '628', // REINO UNIDO
  GD: '297', // GRANADA
  GE: '287', // GEORGIA
  GF: '340', // GUAYANA FRANCESA
  GH: '289', // GHANA
  GL: '315', // GROENLANDIA
  GM: '285', // GAMBIA
  GN: '329', // GUINEA
  GP: '338', // GUADALUPE
  GQ: '331', // GUINEA ECUATORIAL
  GR: '301', // GRECIA
  GT: '317', // GUATEMALA
  GW: '334', // GUINEA-BISSAU
  GY: '325', // GUYANA
  HK: '347', // HONG KONG
  HN: '345', // HONDURAS
  HR: '198', // CROACIA
  HT: '341', // HAITI
  HU: '355', // HUNGRIA
  ID: '365', // INDONESIA
  IE: '375', // IRLANDA
  IL: '383', // ISRAEL
  IN: '361', // INDIA
  IQ: '369', // IRAQ
  IR: '372', // IRAN
  IS: '379', // ISLANDIA
  IT: '386', // ITALIA
  JM: '391', // JAMAICA
  JO: '403', // JORDANIA
  JP: '399', // JAPON
  KE: '410', // KENIA
  KG: '412', // KIRGUISTAN
  KH: '141', // CAMBOYA
  KI: '411', // KIRIBATI
  KM: '171', // COMORAS
  KN: '695', // SAN CRISTOBAL Y NIEVES
  KP: '651', // COREA DEL NORTE
  KR: '190', // COREA DEL SUR
  KW: '413', // KUWAIT
  KY: '137', // ISLAS CAIMAN
  KZ: '406', // KAZAJISTAN
  LA: '420', // LAOS
  LB: '431', // LIBANO
  LC: '715', // SANTA LUCIA
  LI: '441', // LIECHTENSTEIN
  LK: '750', // SRI LANKA
  LR: '434', // LIBERIA
  LS: '426', // LESOTHO
  LT: '429', // LITUANIA
  LU: '442', // LUXEMBURGO
  LV: '428', // LETONIA
  LY: '438', // LIBIA
  MA: '474', // MARRUECOS
  MC: '496', // MONACO
  MD: '495', // MOLDAVIA
  ME: '499', // MONTENEGRO
  MG: '450', // MADAGASCAR
  MH: '475', // ISLAS MARSHALL
  MK: '642', // REPUBLICA DE MACEDONIA
  ML: '464', // MALI
  MM: '507', // MYANMAR
  MN: '497', // MONGOLIA
  MO: '447', // MACAO
  MQ: '490', // MARTINICA
  MR: '488', // MAURITANIA
  MT: '467', // MALTA
  MU: '485', // MAURICIO
  MV: '461', // MALDIVAS
  MW: '458', // MALAWI
  MX: '493', // MEXICO
  MY: '455', // MALASIA
  MZ: '505', // MOZAMBIQUE
  NA: '512', // NAMIBIA
  NE: '528', // NIGER
  NG: '525', // NIGERIA
  NI: '521', // NICARAGUA
  NL: '573', // PAISES BAJOS
  NO: '538', // NORUEGA
  NP: '517', // NEPAL
  NR: '508', // NAURU
  NZ: '540', // NUEVA ZELANDA
  OM: '542', // OMAN
  PA: '580', // PANAMA
  PE: '589', // PERU
  PG: '582', // PAPUA NUEVA GUINEA
  PH: '267', // FILIPINAS
  PK: '576', // PAKISTAN
  PL: '603', // POLONIA
  PR: '611', // PUERTO RICO
  PS: '600', // PALESTINA (ANP)
  PT: '607', // PORTUGAL
  PW: '578', // PALAOS
  PY: '586', // PARAGUAY
  QA: '618', // QATAR
  RO: '670', // RUMANIA
  RS: '729', // SERBIA
  RU: '673', // RUSIA
  RW: '675', // RWANDA
  SA: '55', // ARABIA SAUDITA
  SB: '395', // ISLAS SALOMON
  SC: '731', // SEYCHELLES
  SD: '759', // SUDAN
  SE: '764', // SUECIA
  SG: '741', // SINGAPUR
  SI: '248', // ESLOVENIA
  SK: '247', // ESLOVAQUIA
  SL: '735', // SIERRA LEONA
  SM: '701', // SAN MARINO
  SN: '728', // SENEGAL
  SO: '748', // SOMALIA
  SR: '770', // SURINAM
  ST: '720', // SANTO TOME Y PRINCIPE
  SV: '242', // EL SALVADOR
  SY: '744', // SIRIA
  SZ: '773', // SWAZILANDIA
  TD: '151', // CHAD
  TG: '800', // TOGO
  TH: '776', // TAILANDIA
  TJ: '775', // TAYIKISTAN
  TL: '783', // TIMOR ORIENTAL
  TM: '829', // TURKMENISTAN
  TN: '820', // TUNEZ
  TO: '810', // TONGA
  TR: '827', // TURQUIA
  TT: '815', // TRINIDAD Y TOBAGO
  TV: '828', // TUVALU
  TW: '774', // TAIWAN
  TZ: '780', // TANZANIA
  UA: '830', // UCRANIA
  UG: '833', // UGANDA
  US: '249', // ESTADOS UNIDOS
  UY: '845', // URUGUAY
  UZ: '847', // UZBEKISTAN
  VA: '717', // CIUDAD DEL VATICANO
  VC: '705', // SAN VICENTE Y LAS GRANADINAS
  VE: '850', // VENEZUELA
  VG: '866', // ISLAS VIRGENES BRITANICAS
  VI: '867', // ISLAS VIRGENES ESTADOUNIDENSES
  VN: '855', // VIETNAM
  VU: '849', // VANUATU
  WS: '699', // SAMOA
  YE: '880', // YEMEN
  ZA: '756', // SUDAFRICA
  ZM: '890', // ZAMBIA
  ZW: '892', // ZIMBABUE
};

/** Código de ciudad del SIRE: el código DANE del municipio sin el cero inicial (Filandia 63272, Medellín 5001). */
export function sireCityCode(town: string, department: string): string {
  const dane = DANE_CODES[`${town}|${department}`];
  return dane ? String(Number(dane)) : '';
}

/** Fecha del SIRE: día/mes/año con dos dígitos (23/04/2012), como el archivo de ejemplo. */
export function sireDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso ?? '')) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Códigos completos del establecimiento para el archivo plano. */
export function sireCodes(hotel: string, city: string): SireCodes {
  return {
    hotel: (hotel ?? '').replace(/\D/g, ''),
    city: (city ?? '').replace(/\D/g, ''),
    docType: c => SIRE_DOC_CODES[c] ?? '',
    country: id => SIRE_COUNTRY_CODES[id] ?? '',
    movement: t => SIRE_MOVEMENT_CODES[t],
    date: sireDate,
  };
}
