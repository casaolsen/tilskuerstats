// Seed dataset for bootstrapping the site with plausible, real-anchored numbers.
//
// Team home-attendance *averages* and venue capacities are grounded in public
// reporting for the 2025 (SE/NO) / 2025-26 (DK) top-flight seasons (see README).
// Individual per-match figures below are SYNTHESIZED around those averages —
// they are demo data, not a scraped historical record. Swap them out once the
// real scrapers (see src/scrapers/) are wired up to live sources.

export type SeedTeam = {
  name: string;
  shortName: string;
  slug: string;
  city: string;
  venue: string;
  capacity: number;
  avgAttendance: number;
};

export type SeedLeague = {
  countryCode: "DK" | "SE" | "NO";
  countryName: string;
  leagueName: string;
  leagueSlug: string;
  seasonLabel: string;
  seasonStart: string; // ISO date
  teams: SeedTeam[];
};

export const LEAGUES: SeedLeague[] = [
  {
    countryCode: "DK",
    countryName: "Danmark",
    leagueName: "Superliga",
    leagueSlug: "superliga",
    seasonLabel: "2025/2026",
    seasonStart: "2025-07-18",
    teams: [
      { name: "FC København", shortName: "FCK", slug: "fc-kobenhavn", city: "København", venue: "Parken", capacity: 38065, avgAttendance: 17200 },
      { name: "Brøndby IF", shortName: "BIF", slug: "brondby-if", city: "Brøndby", venue: "Brøndby Stadion", capacity: 28000, avgAttendance: 15000 },
      { name: "AGF", shortName: "AGF", slug: "agf", city: "Aarhus", venue: "Ceres Park", capacity: 19433, avgAttendance: 13800 },
      { name: "FC Midtjylland", shortName: "FCM", slug: "fc-midtjylland", city: "Herning", venue: "MCH Arena", capacity: 11809, avgAttendance: 9600 },
      { name: "Vejle Boldklub", shortName: "VB", slug: "vejle-boldklub", city: "Vejle", venue: "Vejle Stadion", capacity: 12000, avgAttendance: 11200 },
      { name: "OB", shortName: "OB", slug: "ob", city: "Odense", venue: "Nature Energy Park", capacity: 15761, avgAttendance: 9000 },
      { name: "Randers FC", shortName: "RFC", slug: "randers-fc", city: "Randers", venue: "Cepheus Park Randers", capacity: 10300, avgAttendance: 5100 },
      { name: "Silkeborg IF", shortName: "SIF", slug: "silkeborg-if", city: "Silkeborg", venue: "JYSK Park", capacity: 10000, avgAttendance: 6200 },
      { name: "Viborg FF", shortName: "VFF", slug: "viborg-ff", city: "Viborg", venue: "Energi Viborg Arena", capacity: 10000, avgAttendance: 5000 },
      { name: "FC Nordsjælland", shortName: "FCN", slug: "fc-nordsjaelland", city: "Farum", venue: "Right to Dream Park", capacity: 10300, avgAttendance: 4100 },
      { name: "SønderjyskE", shortName: "SJE", slug: "sonderjyske", city: "Haderslev", venue: "Sydbank Park", capacity: 10000, avgAttendance: 4400 },
      { name: "Lyngby Boldklub", shortName: "LBK", slug: "lyngby-boldklub", city: "Lyngby", venue: "Lyngby Stadion", capacity: 7500, avgAttendance: 3600 },
    ],
  },
  {
    countryCode: "SE",
    countryName: "Sverige",
    leagueName: "Allsvenskan",
    leagueSlug: "allsvenskan",
    seasonLabel: "2025",
    seasonStart: "2025-03-29",
    teams: [
      { name: "AIK", shortName: "AIK", slug: "aik", city: "Solna", venue: "Strawberry Arena", capacity: 50000, avgAttendance: 30024 },
      { name: "Hammarby IF", shortName: "HIF", slug: "hammarby-if", city: "Stockholm", venue: "Tele2 Arena", capacity: 30000, avgAttendance: 24297 },
      { name: "Djurgårdens IF", shortName: "DIF", slug: "djurgardens-if", city: "Stockholm", venue: "Tele2 Arena", capacity: 30000, avgAttendance: 19400 },
      { name: "Malmö FF", shortName: "MFF", slug: "malmo-ff", city: "Malmö", venue: "Eleda Stadion", capacity: 24000, avgAttendance: 15200 },
      { name: "IFK Göteborg", shortName: "IFKG", slug: "ifk-goteborg", city: "Göteborg", venue: "Gamla Ullevi", capacity: 18800, avgAttendance: 14000 },
      { name: "BK Häcken", shortName: "HAC", slug: "bk-hacken", city: "Göteborg", venue: "Bravida Arena", capacity: 6500, avgAttendance: 4600 },
      { name: "IFK Norrköping", shortName: "IFKN", slug: "ifk-norrkoping", city: "Norrköping", venue: "Platinumcars Arena", capacity: 17234, avgAttendance: 8100 },
      { name: "IF Elfsborg", shortName: "ELF", slug: "if-elfsborg", city: "Borås", venue: "Borås Arena", capacity: 16800, avgAttendance: 8500 },
      { name: "Mjällby AIF", shortName: "MAIF", slug: "mjallby-aif", city: "Hällevik", venue: "Strandvallen", capacity: 5000, avgAttendance: 3000 },
      { name: "IK Sirius", shortName: "SIR", slug: "ik-sirius", city: "Uppsala", venue: "Studenternas IP", capacity: 8500, avgAttendance: 5000 },
      { name: "Halmstads BK", shortName: "HBK", slug: "halmstads-bk", city: "Halmstad", venue: "Örjans Vall", capacity: 16000, avgAttendance: 6000 },
      { name: "GAIS", shortName: "GAIS", slug: "gais", city: "Göteborg", venue: "Gamla Ullevi", capacity: 18800, avgAttendance: 7000 },
      { name: "Degerfors IF", shortName: "DEG", slug: "degerfors-if", city: "Degerfors", venue: "Stora Valla", capacity: 6500, avgAttendance: 4000 },
      { name: "IF Brommapojkarna", shortName: "BP", slug: "if-brommapojkarna", city: "Stockholm", venue: "Grimsta IP", capacity: 3000, avgAttendance: 2242 },
      { name: "IFK Värnamo", shortName: "VMO", slug: "ifk-varnamo", city: "Värnamo", venue: "Finnvedsvallen", capacity: 6000, avgAttendance: 4000 },
      { name: "Östers IF", shortName: "OIF", slug: "osters-if", city: "Växjö", venue: "Myresjöhus Arena", capacity: 8500, avgAttendance: 4500 },
    ],
  },
  {
    countryCode: "NO",
    countryName: "Norge",
    leagueName: "Eliteserien",
    leagueSlug: "eliteserien",
    seasonLabel: "2025",
    seasonStart: "2025-04-06",
    teams: [
      { name: "Rosenborg BK", shortName: "RBK", slug: "rosenborg-bk", city: "Trondheim", venue: "Lerkendal Stadion", capacity: 21421, avgAttendance: 15200 },
      { name: "SK Brann", shortName: "BRANN", slug: "sk-brann", city: "Bergen", venue: "Brann Stadion", capacity: 16800, avgAttendance: 12100 },
      { name: "Molde FK", shortName: "MFK", slug: "molde-fk", city: "Molde", venue: "Aker Stadion", capacity: 11249, avgAttendance: 8600 },
      { name: "Vålerenga Fotball", shortName: "VIF", slug: "valerenga", city: "Oslo", venue: "Intility Arena", capacity: 16555, avgAttendance: 9100 },
      { name: "FK Bodø/Glimt", shortName: "BOG", slug: "bodo-glimt", city: "Bodø", venue: "Aspmyra Stadion", capacity: 8270, avgAttendance: 7600 },
      { name: "Viking FK", shortName: "VIK", slug: "viking-fk", city: "Stavanger", venue: "SR-Bank Arena", capacity: 15300, avgAttendance: 8500 },
      { name: "Lillestrøm SK", shortName: "LSK", slug: "lillestrom-sk", city: "Lillestrøm", venue: "Åråsen Stadion", capacity: 11650, avgAttendance: 6100 },
      { name: "Strømsgodset IF", shortName: "SIF", slug: "stromsgodset", city: "Drammen", venue: "Marienlyst Stadion", capacity: 9645, avgAttendance: 4500 },
      { name: "Odds BK", shortName: "ODD", slug: "odds-bk", city: "Skien", venue: "Skagerak Arena", capacity: 8746, avgAttendance: 4000 },
      { name: "Sarpsborg 08 FF", shortName: "S08", slug: "sarpsborg-08", city: "Sarpsborg", venue: "Sarpsborg Stadion", capacity: 8460, avgAttendance: 3500 },
      { name: "Tromsø IL", shortName: "TIL", slug: "tromso-il", city: "Tromsø", venue: "Romssa Arena", capacity: 10500, avgAttendance: 5000 },
      { name: "Hamarkameratene", shortName: "HAM", slug: "hamkam", city: "Hamar", venue: "Briskeby", capacity: 8500, avgAttendance: 4000 },
      { name: "KFUM Oslo", shortName: "KFUM", slug: "kfum-oslo", city: "Oslo", venue: "Ekebergsletta", capacity: 3000, avgAttendance: 2200 },
      { name: "Bryne FK", shortName: "BRY", slug: "bryne-fk", city: "Bryne", venue: "Bryne Stadion", capacity: 5000, avgAttendance: 3200 },
      { name: "Kristiansund BK", shortName: "KBK", slug: "kristiansund-bk", city: "Kristiansund", venue: "Kristiansund Stadion", capacity: 6000, avgAttendance: 3500 },
      { name: "Sandefjord Fotball", shortName: "SAN", slug: "sandefjord-fotball", city: "Sandefjord", venue: "Release Arena", capacity: 7300, avgAttendance: 3000 },
    ],
  },
];
