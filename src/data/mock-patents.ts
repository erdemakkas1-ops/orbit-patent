import {
  type Patent,
  type Localized,
  type LegalEventKind,
} from "@/types/patent";
import { resolvePatentLegalStatus } from "@/lib/patents/legal-status/resolve";
const l = (tr: string, en: string): Localized => ({ tr, en });
const rows: [
  string,
  string,
  string,
  string,
  string,
  string,
  LegalEventKind | "ACTIVE",
  number,
][] = [
  [
    "ToF sensörlü titreşimli yönlendirme bastonu",
    "ToF sensing haptic navigation cane",
    "Uçuş süresi sensörü engel mesafesini ölçer. Sap üzerindeki iki titreşim motoru engelin yönünü ve yakınlığını ayrı darbe dizileriyle bildirir.",
    "A time-of-flight sensor measures obstacles. Two handle motors encode direction and proximity as distinct pulse sequences.",
    "A61H3/06",
    "G01S17/08",
    "ACTIVE",
    2022,
  ],
  [
    "Uyarlanabilir robot kavrayıcı",
    "Adaptive robotic gripper",
    "Esnek parmaklar, kuvvet sensörlerinden alınan geri bildirimle kırılgan nesneleri kavrar. Diferansiyel mekanizma temas yükünü parmaklar arasında dağıtır.",
    "Compliant fingers use force feedback to grip fragile objects. A differential mechanism distributes contact loads across fingers.",
    "B25J15/12",
    "B25J15/00",
    "EXPIRED",
    2001,
  ],
  [
    "Konveyör için optik parça ayırıcı",
    "Optical conveyor part sorter",
    "Hat kamerası parça konturunu ölçer. Enkoderden hesaplanan gecikmeyle tetiklenen hava valfi kusurlu parçayı üretim hattından ayırır.",
    "A line camera measures part contours. An air valve triggered with encoder-based timing ejects defective parts.",
    "B07C5/342",
    "B07C5/00",
    "LAPSED",
    2014,
  ],
  [
    "Kablosuz toprak nem sensörü",
    "Wireless soil moisture sensor",
    "Kapasitif elektrotlar toprak nemini izler. Sıcaklık telafisi ve aralıklı uyanma döngüsü ölçüm kaymasını ve pil tüketimini azaltır.",
    "Capacitive electrodes monitor soil moisture. Temperature compensation and intermittent wake cycles reduce drift and battery usage.",
    "G01N27/22",
    "G01N27/00",
    "WITHDRAWN",
    2020,
  ],
  [
    "Atık ısıdan enerji hasadı modülü",
    "Waste heat energy harvesting module",
    "Termoelektrik plakalar boru yüzeyindeki sıcaklık farkından elektrik üretir. Yaylı baskı plakası termal teması korur.",
    "Thermoelectric plates harvest a pipe temperature gradient. A spring-loaded clamp maintains thermal contact.",
    "H10N10/00",
    "H02N11/00",
    "ACTIVE",
    2021,
  ],
  [
    "Düşük boşluklu sikloidal redüktör",
    "Low backlash cycloidal reducer",
    "Eksantrik mil iki faz kaydırılmış diski sürer. İğneli rulman dizisi çıkış torkunu aktarırken dişli boşluğunu sınırlar.",
    "An eccentric shaft drives two phase-shifted discs. Needle bearings transmit output torque while limiting backlash.",
    "F16H1/32",
    "F16H1/00",
    "EXPIRED",
    1999,
  ],
  [
    "Katmanlı üretimde nozul temizleme sistemi",
    "Nozzle cleaning for additive manufacturing",
    "Nozul, baskı hareketleri arasında değiştirilebilir fırçaya yönlendirilir. Optik algılayıcı artık filamentin uzaklaştırılmasını doğrular.",
    "A nozzle moves to a replaceable brush between printing passes. An optical detector verifies residual filament removal.",
    "B33Y40/00",
    "B29C64/00",
    "REVOKED",
    2018,
  ],
  [
    "Tek elle kullanılabilen mekanik kavrama desteği",
    "Single-handed mechanical grip aid",
    "Bilek hareketi kablo aktarması üzerinden kavrama çenesini kapatır. Yaylı geri dönüş mekanizması çeneyi güvenli biçimde açar.",
    "Wrist motion closes a gripping jaw through a cable transmission. A spring return opens the jaw safely.",
    "A61F2/54",
    "A61F2/00",
    "ABANDONED",
    2017,
  ],
  [
    "Batarya modülü için pasif soğutma kanalı",
    "Passive battery cooling channel",
    "Kanatçıklı alüminyum kanallar modül çevresinde doğal hava akışı oluşturur. Yalıtkan ara katman elektriksel teması önler.",
    "Finned aluminium channels induce natural airflow around a battery module. An insulating interface prevents electrical contact.",
    "H01M10/613",
    "H01M10/60",
    "UNMAPPED",
    2023,
  ],
  [
    "Titreşim izlemeli kestirimci bakım düğümü",
    "Vibration monitoring maintenance node",
    "Üç eksenli ivmeölçer makine yataklarından örnek alır. Yerel spektral analiz, eşik aşımını düşük güçlü radyo üzerinden bildirir.",
    "A triaxial accelerometer samples machine bearings. Local spectral analysis reports threshold crossings over low-power radio.",
    "G01H1/00",
    "G05B23/02",
    "ACTIVE",
    2024,
  ],
];
export const mockPatents: Patent[] = rows.map((r, i) => {
  const [tr, en, atr, aen, cpc, ipc, kind, year] = r;
  const legalEvents: Patent["legalEvents"] = [
    {
      id: `${i}-file`,
      date: `${year - 2}-02-10`,
      jurisdiction: "TR",
      kind: "FILED",
      description: l("Başvuru kaydı oluşturuldu.", "Application filed."),
      source: "mock",
    },
  ];
  if (!["WITHDRAWN", "ABANDONED"].includes(kind))
    legalEvents.push({
      id: `${i}-grant`,
      date: `${year}-06-20`,
      jurisdiction: "TR",
      kind: "GRANTED",
      description: l("Örnek tescil kaydı.", "Illustrative grant record."),
      source: "mock",
    });
  if (kind !== "ACTIVE")
    legalEvents.push({
      id: `${i}-event`,
      date: `${Math.min(year + 3, 2025)}-09-01`,
      jurisdiction: "TR",
      kind,
      description: l(
        "Örnek sicil durum değişikliği.",
        "Illustrative register status change.",
      ),
      source: "mock",
    });
  const abstract = l(atr, aen);
  return {
    id: `orbit-${String(i + 1).padStart(3, "0")}`,
    publicationNumber: `DEMO-TR-${year}-${String(i + 1).padStart(5, "0")}`,
    applicationNumber: `DEMO-APP-${year - 2}-${i + 1}`,
    title: l(tr, en),
    abstract,
    description: l(
      `${atr} Düzenek, modüler gövde ve değiştirilebilir bileşenler ile prototip doğrulamasına uygundur. Bu kayıt test amaçlı oluşturulmuştur; gerçek bir patent belgesi değildir.`,
      `${aen} A modular housing and replaceable components support prototype validation. This is a synthetic test record, not an actual patent document.`,
    ),
    inventors: [["Deniz Kaya", "Ece Demir", "Arda Yılmaz"][i % 3]],
    applicants: ["ORBIT Demo Lab"],
    publicationDate: `${year}-06-20`,
    applicationDate: `${year - 2}-02-10`,
    priorityDate: `${year - 2}-02-10`,
    cpc: [cpc],
    ipc: [ipc],
    legalStatus: resolvePatentLegalStatus(legalEvents),
    legalEvents,
    drawings: [
      {
        url: "/drawing.svg",
        caption: l(
          "Örnek sistem blok şeması; patent çizimi değildir.",
          "Illustrative system block diagram; not a patent drawing.",
        ),
      },
    ],
    family: [{ publicationNumber: `DEMO-TR-${year}-${i + 1}`, country: "TR" }],
    source: "mock",
  };
});
