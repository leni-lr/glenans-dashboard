// Météo-France coastal bulletin zones (9). Each carries several representative
// points along its coast segment; a location is assigned to the zone with the
// nearest point (robust for these long zones, unlike a single centroid).
export const BMS_ZONES = [
  { code: "BMSCOTE-01-01", title: "Frontière belge / Baie de Somme",
    points: [[51.03, 2.37], [50.72, 1.60], [50.22, 1.55]] },
  { code: "BMSCOTE-01-02", title: "Baie de Somme / Cap de la Hague",
    points: [[49.92, 1.08], [49.49, 0.11], [49.64, -1.62]] },
  { code: "BMSCOTE-01-03", title: "Cap de la Hague / Penmarc'h",
    points: [[48.65, -2.02], [48.72, -3.98], [48.35, -4.50], [47.80, -4.37]] },
  { code: "BMSCOTE-01-04", title: "Penmarc'h / Anse de l'Aiguillon",
    points: [[47.87, -3.92], [47.70, -3.40], [47.32, -3.22], [47.27, -2.20], [46.50, -1.80]] },
  { code: "BMSCOTE-01-05", title: "Anse de l'Aiguillon / Frontière espagnole",
    points: [[46.15, -1.15], [44.66, -1.16], [43.48, -1.56]] },
  { code: "BMSCOTE-02-01", title: "Frontière espagnole / Port-Camargue",
    points: [[42.52, 3.11], [43.40, 3.70], [43.53, 4.13]] },
  { code: "BMSCOTE-02-02", title: "Port-Camargue / Saint-Raphaël",
    points: [[43.30, 5.37], [43.12, 5.93], [43.42, 6.77]] },
  { code: "BMSCOTE-02-03", title: "Saint-Raphaël / Menton",
    points: [[43.55, 7.02], [43.70, 7.26], [43.78, 7.50]] },
  { code: "BMSCOTE-02-04", title: "Corse",
    points: [[41.92, 8.74], [42.70, 9.45], [41.58, 9.28]] },
];
