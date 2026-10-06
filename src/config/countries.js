// ISO 3166-1 alpha-2 codes of all countries/territories we can ship to (worldwide).
// Names are rendered per locale at build time with Intl.DisplayNames (src/web/templates/pages.js).
export const EU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'];
// Non-EU Europe that ships at the "europe" rate (configurable; EEA + CH + UK + microstates + Balkans).
export const EUROPE_OTHER = ['NO', 'IS', 'LI', 'CH', 'GB', 'MC', 'SM', 'VA', 'AD', 'RS', 'ME', 'MK', 'AL', 'BA', 'XK', 'MD', 'UA', 'GE', 'AM', 'TR'];

export const ALL_COUNTRIES = [
  'AF','AX','AL','DZ','AS','AD','AO','AI','AG','AR','AM','AW','AU','AT','AZ','BS','BH','BD','BB','BY','BE','BZ','BJ','BM','BT','BO','BQ','BA','BW','BR','IO','BN','BG','BF','BI','CV','KH','CM','CA','KY','CF','TD','CL','CN','CX','CC','CO','KM','CG','CD','CK','CR','CI','HR','CW','CY','CZ','DK','DJ','DM','DO','EC','EG','SV','GQ','ER','EE','SZ','ET','FK','FO','FJ','FI','FR','GF','PF','GA','GM','GE','DE','GH','GI','GR','GL','GD','GP','GU','GT','GG','GN','GW','GY','HT','HN','HK','HU','IS','IN','ID','IQ','IE','IM','IL','IT','JM','JP','JE','JO','KZ','KE','KI','XK','KW','KG','LA','LV','LB','LS','LR','LY','LI','LT','LU','MO','MG','MW','MY','MV','ML','MT','MH','MQ','MR','MU','YT','MX','FM','MD','MC','MN','ME','MS','MA','MZ','MM','NA','NR','NP','NL','NC','NZ','NI','NE','NG','NU','NF','MK','MP','NO','OM','PK','PW','PS','PA','PG','PY','PE','PH','PN','PL','PT','PR','QA','RE','RO','RW','BL','SH','KN','LC','MF','PM','VC','WS','SM','ST','SA','SN','RS','SC','SL','SG','SX','SK','SI','SB','SO','ZA','GS','KR','ES','LK','SR','SJ','SE','CH','TW','TJ','TZ','TH','TL','TG','TK','TO','TT','TN','TR','TM','TC','TV','UG','UA','AE','GB','US','UY','UZ','VU','VA','VE','VN','VG','VI','WF','EH','ZM','ZW',
];

/** Localized country name (falls back to the code). */
export function countryName(code, locale = 'en') {
  try { return new Intl.DisplayNames([locale], { type: 'region' }).of(code) || code; } catch { return code; }
}

/** [code, name] pairs sorted by the locale's collation. */
export function countryOptions(codes, locale = 'en') {
  const coll = new Intl.Collator(locale);
  return codes.map((c) => [c, countryName(c, locale)]).sort((a, b) => coll.compare(a[1], b[1]));
}
