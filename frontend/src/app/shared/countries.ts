// Países del mundo (ISO 3166-1) con nombre en español y código numérico. Lo usan Reservas,
// la TRA y el SIRE, así un país se llama igual en todo SOGO.

export interface WorldCountry { id: string; name: string; isoNumeric: string; }

const C = (id: string, name: string, isoNumeric: string): WorldCountry => ({ id, name, isoNumeric });
const WORLD: WorldCountry[] = [
  C('AF', 'Afganistán', '004'), C('AL', 'Albania', '008'), C('DE', 'Alemania', '276'), C('AD', 'Andorra', '020'),
  C('AO', 'Angola', '024'), C('AG', 'Antigua y Barbuda', '028'), C('SA', 'Arabia Saudita', '682'), C('DZ', 'Argelia', '012'),
  C('AR', 'Argentina', '032'), C('AM', 'Armenia', '051'), C('AW', 'Aruba', '533'), C('AU', 'Australia', '036'),
  C('AT', 'Austria', '040'), C('AZ', 'Azerbaiyán', '031'), C('BS', 'Bahamas', '044'), C('BD', 'Bangladés', '050'),
  C('BB', 'Barbados', '052'), C('BH', 'Baréin', '048'), C('BE', 'Bélgica', '056'), C('BZ', 'Belice', '084'),
  C('BJ', 'Benín', '204'), C('BM', 'Bermudas', '060'), C('BY', 'Bielorrusia', '112'), C('BO', 'Bolivia', '068'),
  C('BA', 'Bosnia y Herzegovina', '070'), C('BW', 'Botsuana', '072'), C('BR', 'Brasil', '076'), C('BN', 'Brunéi', '096'),
  C('BG', 'Bulgaria', '100'), C('BF', 'Burkina Faso', '854'), C('BI', 'Burundi', '108'), C('BT', 'Bután', '064'),
  C('CV', 'Cabo Verde', '132'), C('KH', 'Camboya', '116'), C('CM', 'Camerún', '120'), C('CA', 'Canadá', '124'),
  C('BQ', 'Caribe Neerlandés', '535'), C('QA', 'Catar', '634'), C('TD', 'Chad', '148'),
  C('CL', 'Chile', '152'), C('CN', 'China', '156'), C('CY', 'Chipre', '196'), C('VA', 'Ciudad del Vaticano', '336'),
  C('CO', 'Colombia', '170'), C('KM', 'Comoras', '174'), C('KP', 'Corea del Norte', '408'), C('KR', 'Corea del Sur', '410'),
  C('CI', 'Costa de Marfil', '384'), C('CR', 'Costa Rica', '188'), C('HR', 'Croacia', '191'), C('CU', 'Cuba', '192'),
  C('CW', 'Curazao', '531'), C('DK', 'Dinamarca', '208'), C('DM', 'Dominica', '212'), C('EC', 'Ecuador', '218'),
  C('EG', 'Egipto', '818'), C('SV', 'El Salvador', '222'), C('AE', 'Emiratos Árabes Unidos', '784'), C('ER', 'Eritrea', '232'),
  C('SK', 'Eslovaquia', '703'), C('SI', 'Eslovenia', '705'), C('ES', 'España', '724'), C('US', 'Estados Unidos', '840'),
  C('EE', 'Estonia', '233'), C('SZ', 'Esuatini', '748'), C('ET', 'Etiopía', '231'), C('PH', 'Filipinas', '608'),
  C('FI', 'Finlandia', '246'), C('FJ', 'Fiyi', '242'), C('FR', 'Francia', '250'), C('GA', 'Gabón', '266'),
  C('GM', 'Gambia', '270'), C('GE', 'Georgia', '268'), C('GH', 'Ghana', '288'), C('GD', 'Granada', '308'),
  C('GR', 'Grecia', '300'), C('GL', 'Groenlandia', '304'), C('GP', 'Guadalupe', '312'), C('GT', 'Guatemala', '320'),
  C('GF', 'Guayana Francesa', '254'), C('GN', 'Guinea', '324'), C('GQ', 'Guinea Ecuatorial', '226'), C('GW', 'Guinea-Bisáu', '624'),
  C('GY', 'Guyana', '328'), C('HT', 'Haití', '332'), C('HN', 'Honduras', '340'), C('HK', 'Hong Kong', '344'),
  C('HU', 'Hungría', '348'), C('IN', 'India', '356'), C('ID', 'Indonesia', '360'), C('IQ', 'Irak', '368'),
  C('IR', 'Irán', '364'), C('IE', 'Irlanda', '372'), C('IS', 'Islandia', '352'), C('KY', 'Islas Caimán', '136'),
  C('MH', 'Islas Marshall', '584'), C('SB', 'Islas Salomón', '090'), C('VG', 'Islas Vírgenes Británicas', '092'),
  C('VI', 'Islas Vírgenes de los Estados Unidos', '850'), C('IL', 'Israel', '376'), C('IT', 'Italia', '380'), C('JM', 'Jamaica', '388'),
  C('JP', 'Japón', '392'), C('JO', 'Jordania', '400'), C('KZ', 'Kazajistán', '398'), C('KE', 'Kenia', '404'),
  C('KG', 'Kirguistán', '417'), C('KI', 'Kiribati', '296'), C('KW', 'Kuwait', '414'), C('LA', 'Laos', '418'),
  C('LS', 'Lesoto', '426'), C('LV', 'Letonia', '428'), C('LB', 'Líbano', '422'), C('LR', 'Liberia', '430'),
  C('LY', 'Libia', '434'), C('LI', 'Liechtenstein', '438'), C('LT', 'Lituania', '440'), C('LU', 'Luxemburgo', '442'),
  C('MO', 'Macao', '446'), C('MK', 'Macedonia del Norte', '807'), C('MG', 'Madagascar', '450'), C('MY', 'Malasia', '458'),
  C('MW', 'Malaui', '454'), C('MV', 'Maldivas', '462'), C('ML', 'Malí', '466'), C('MT', 'Malta', '470'),
  C('MA', 'Marruecos', '504'), C('MQ', 'Martinica', '474'), C('MU', 'Mauricio', '480'), C('MR', 'Mauritania', '478'),
  C('MX', 'México', '484'), C('FM', 'Micronesia', '583'), C('MD', 'Moldavia', '498'), C('MC', 'Mónaco', '492'),
  C('MN', 'Mongolia', '496'), C('ME', 'Montenegro', '499'), C('MZ', 'Mozambique', '508'), C('MM', 'Myanmar (Birmania)', '104'),
  C('NA', 'Namibia', '516'), C('NR', 'Nauru', '520'), C('NP', 'Nepal', '524'), C('NI', 'Nicaragua', '558'),
  C('NE', 'Níger', '562'), C('NG', 'Nigeria', '566'), C('NO', 'Noruega', '578'), C('NZ', 'Nueva Zelanda', '554'),
  C('OM', 'Omán', '512'), C('NL', 'Países Bajos', '528'), C('PK', 'Pakistán', '586'), C('PW', 'Palaos', '585'),
  C('PS', 'Palestina', '275'), C('PA', 'Panamá', '591'), C('PG', 'Papúa Nueva Guinea', '598'), C('PY', 'Paraguay', '600'),
  C('PE', 'Perú', '604'), C('PL', 'Polonia', '616'), C('PT', 'Portugal', '620'), C('PR', 'Puerto Rico', '630'),
  C('GB', 'Reino Unido', '826'), C('CF', 'República Centroafricana', '140'), C('CZ', 'República Checa', '203'),
  C('CG', 'República del Congo', '178'), C('CD', 'República Democrática del Congo', '180'), C('DO', 'República Dominicana', '214'),
  C('RW', 'Ruanda', '646'), C('RO', 'Rumania', '642'), C('RU', 'Rusia', '643'), C('WS', 'Samoa', '882'),
  C('KN', 'San Cristóbal y Nieves', '659'), C('SM', 'San Marino', '674'), C('SX', 'San Martín (Sint Maarten)', '534'),
  C('VC', 'San Vicente y las Granadinas', '670'), C('LC', 'Santa Lucía', '662'), C('ST', 'Santo Tomé y Príncipe', '678'),
  C('SN', 'Senegal', '686'), C('RS', 'Serbia', '688'), C('SC', 'Seychelles', '690'), C('SL', 'Sierra Leona', '694'),
  C('SG', 'Singapur', '702'), C('SY', 'Siria', '760'), C('SO', 'Somalia', '706'), C('LK', 'Sri Lanka', '144'),
  C('ZA', 'Sudáfrica', '710'), C('SD', 'Sudán', '729'), C('SS', 'Sudán del Sur', '728'), C('SE', 'Suecia', '752'),
  C('CH', 'Suiza', '756'), C('SR', 'Surinam', '740'), C('TH', 'Tailandia', '764'), C('TW', 'Taiwán', '158'),
  C('TZ', 'Tanzania', '834'), C('TJ', 'Tayikistán', '762'), C('TL', 'Timor Oriental', '626'), C('TG', 'Togo', '768'),
  C('TO', 'Tonga', '776'), C('TT', 'Trinidad y Tobago', '780'), C('TN', 'Túnez', '788'), C('TM', 'Turkmenistán', '795'),
  C('TR', 'Turquía', '792'), C('TV', 'Tuvalu', '798'), C('UA', 'Ucrania', '804'), C('UG', 'Uganda', '800'),
  C('UY', 'Uruguay', '858'), C('UZ', 'Uzbekistán', '860'), C('VU', 'Vanuatu', '548'), C('VE', 'Venezuela', '862'),
  C('VN', 'Vietnam', '704'), C('YE', 'Yemen', '887'), C('DJ', 'Yibuti', '262'), C('ZM', 'Zambia', '894'),
  C('ZW', 'Zimbabue', '716'),
];

/** Colombia primero; el resto en orden alfabético. */
export const WORLD_COUNTRIES: WorldCountry[] = [
  ...WORLD.filter(c => c.id === 'CO'),
  ...WORLD.filter(c => c.id !== 'CO').sort((a, b) => a.name.localeCompare(b.name, 'es')),
];

/** Los que más llegan: salen primero en los buscadores con el campo vacío. */
export const FREQUENT_COUNTRY_IDS = ['CO', 'US', 'ES', 'AR', 'MX', 'CL', 'EC', 'PE', 'VE', 'BR', 'CA', 'FR', 'DE'];
