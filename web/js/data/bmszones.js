// Météo-France coastal bulletin zones (9). `lat/lon` is a representative point on
// each zone's coast segment; the nearest zone to a location wins.
export const BMS_ZONES = [
  { code: "BMSCOTE-01-01", title: "Frontière belge / Baie de Somme",           lat: 50.9, lon: 1.9 },
  { code: "BMSCOTE-01-02", title: "Baie de Somme / Cap de la Hague",           lat: 49.6, lon: -0.5 },
  { code: "BMSCOTE-01-03", title: "Cap de la Hague / Penmarc'h",               lat: 48.6, lon: -3.9 },
  { code: "BMSCOTE-01-04", title: "Penmarc'h / Anse de l'Aiguillon",           lat: 47.3, lon: -2.6 },
  { code: "BMSCOTE-01-05", title: "Anse de l'Aiguillon / Frontière espagnole", lat: 45.0, lon: -1.2 },
  { code: "BMSCOTE-02-01", title: "Frontière espagnole / Port-Camargue",       lat: 43.2, lon: 3.7 },
  { code: "BMSCOTE-02-02", title: "Port-Camargue / Saint-Raphaël",             lat: 43.3, lon: 5.9 },
  { code: "BMSCOTE-02-03", title: "Saint-Raphaël / Menton",                    lat: 43.6, lon: 7.2 },
  { code: "BMSCOTE-02-04", title: "Corse",                                     lat: 42.1, lon: 9.0 },
];
