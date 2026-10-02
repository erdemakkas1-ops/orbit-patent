import type { BuildEstimate } from "@/types/ai";
import type { Locale } from "@/types/patent";
import { calculateCost, calculateDifficulty } from "@/lib/ai/engines";
type Part = [string, string, number, number, string, string];
type Profile = {
  difficulty: [number, number, number, number, number];
  parts: Part[];
};
const profiles: Profile[] = [
  {
    difficulty: [6, 5, 3, 4, 7],
    parts: [
      [
        "ToF mesafe modülü",
        "ToF distance module",
        2,
        420,
        "Engel mesafesi ölçümü",
        "Measure obstacle distance",
      ],
      [
        "Titreşim motoru ve sürücü",
        "Vibration motor and driver",
        2,
        160,
        "Yön ve yakınlık geri bildirimi",
        "Direction and proximity feedback",
      ],
      [
        "Mikrodenetleyici kartı",
        "Microcontroller board",
        1,
        550,
        "Ölçümleri titreşim dizisine dönüştürme",
        "Convert measurements to pulse sequences",
      ],
      [
        "Baston gövdesi, pil ve koruma seti",
        "Cane housing, battery and protection kit",
        1,
        1100,
        "Mekanik taşıma ve düşük gerilim besleme",
        "Mechanical support and low-voltage power",
      ],
    ],
  },
  {
    difficulty: [5, 5, 8, 7, 7],
    parts: [
      [
        "Servo motor",
        "Servo motor",
        2,
        850,
        "Parmakları hareket ettirme",
        "Actuate fingers",
      ],
      [
        "Kuvvet sensörü",
        "Force sensor",
        3,
        300,
        "Temas kuvveti geri bildirimi",
        "Contact force feedback",
      ],
      [
        "Esnek parmak ve diferansiyel seti",
        "Compliant finger and differential kit",
        1,
        2200,
        "Yükü paylaştırma",
        "Distribute contact load",
      ],
      [
        "Kontrol kartı ve güç kaynağı",
        "Controller and power supply",
        1,
        1200,
        "Kapalı çevrim kontrol",
        "Closed-loop control",
      ],
    ],
  },
  {
    difficulty: [6, 7, 6, 6, 7],
    parts: [
      [
        "Hat kamerası",
        "Line camera",
        1,
        2600,
        "Parça konturu algılama",
        "Detect part contours",
      ],
      ["Enkoder", "Encoder", 1, 650, "Konveyör konumu", "Conveyor position"],
      [
        "Hava valfi ve nozul",
        "Air valve and nozzle",
        1,
        1400,
        "Hatalı parçayı ayırma",
        "Eject faulty parts",
      ],
      [
        "Kontrol ve küçük konveyör seti",
        "Controller and small conveyor kit",
        1,
        5200,
        "Masaüstü test hattı",
        "Bench test line",
      ],
    ],
  },
  {
    difficulty: [5, 5, 3, 3, 6],
    parts: [
      [
        "Kapasitif prob",
        "Capacitive probe",
        2,
        180,
        "Toprak nemi algılama",
        "Measure soil moisture",
      ],
      [
        "Sıcaklık sensörü",
        "Temperature sensor",
        1,
        120,
        "Sıcaklık telafisi",
        "Temperature compensation",
      ],
      [
        "Düşük güçlü radyo kartı",
        "Low-power radio board",
        1,
        700,
        "Ölçümleri iletme",
        "Transmit measurements",
      ],
      [
        "Sızdırmaz kutu ve pil",
        "Sealed enclosure and battery",
        1,
        650,
        "Saha prototipi koruması",
        "Protect field prototype",
      ],
    ],
  },
  {
    difficulty: [5, 2, 5, 5, 7],
    parts: [
      [
        "Termoelektrik jeneratör plakası",
        "Thermoelectric generator plate",
        2,
        650,
        "Sıcaklık farkından enerji üretme",
        "Harvest temperature gradient",
      ],
      [
        "Yaylı kelepçe ve soğutucu",
        "Spring clamp and heatsink",
        1,
        1400,
        "Termal temas",
        "Maintain thermal contact",
      ],
      [
        "Enerji hasadı dönüştürücüsü",
        "Energy harvesting converter",
        1,
        900,
        "Düşük gerilimi düzenleme",
        "Regulate low voltage",
      ],
    ],
  },
  {
    difficulty: [1, 1, 8, 9, 8],
    parts: [
      [
        "İşlenmiş sikloidal disk",
        "Machined cycloidal disc",
        2,
        1800,
        "Tork aktarımı",
        "Transmit torque",
      ],
      [
        "Eksantrik mil",
        "Eccentric shaft",
        1,
        1200,
        "Diskleri sürme",
        "Drive discs",
      ],
      [
        "İğneli rulman seti",
        "Needle bearing set",
        1,
        1600,
        "Sürtünmeyi azaltma",
        "Reduce friction",
      ],
      [
        "İşlenmiş gövde",
        "Machined housing",
        1,
        2100,
        "Eksen hizalama",
        "Align axes",
      ],
    ],
  },
  {
    difficulty: [4, 5, 5, 4, 6],
    parts: [
      [
        "Değiştirilebilir fırça",
        "Replaceable brush",
        2,
        150,
        "Filament temizleme",
        "Remove filament",
      ],
      [
        "Optik algılayıcı",
        "Optical detector",
        1,
        250,
        "Temizlik doğrulama",
        "Verify cleaning",
      ],
      [
        "Montaj braketi ve kontrol kartı",
        "Mounting bracket and controller",
        1,
        850,
        "Yazıcıya entegrasyon",
        "Integrate with printer",
      ],
    ],
  },
  {
    difficulty: [1, 1, 6, 5, 8],
    parts: [
      [
        "Kablo ve makara seti",
        "Cable and pulley kit",
        1,
        550,
        "Bilek kuvvetini aktarma",
        "Transfer wrist force",
      ],
      ["Geri dönüş yayı", "Return spring", 2, 120, "Çeneyi açma", "Open jaw"],
      [
        "Yumuşak çene ve bilek desteği",
        "Soft jaw and wrist support",
        1,
        1500,
        "Temas arayüzü",
        "Contact interface",
      ],
    ],
  },
  {
    difficulty: [2, 1, 5, 5, 8],
    parts: [
      [
        "Kanatçıklı alüminyum profil",
        "Finned aluminium profile",
        4,
        350,
        "Doğal hava akışı",
        "Natural airflow",
      ],
      [
        "Elektriksel yalıtkan termal pad",
        "Electrically insulating thermal pad",
        2,
        180,
        "Yalıtılmış ısı aktarımı",
        "Insulated heat transfer",
      ],
      [
        "Test ısıtıcısı ve sıcaklık probu",
        "Test heater and temperature probe",
        1,
        900,
        "Bataryasız termal doğrulama",
        "Thermal validation without a battery",
      ],
    ],
  },
  {
    difficulty: [6, 7, 3, 4, 7],
    parts: [
      [
        "Üç eksenli ivmeölçer",
        "Triaxial accelerometer",
        1,
        450,
        "Titreşim örnekleme",
        "Sample vibration",
      ],
      [
        "Radyo destekli işlemci kartı",
        "Radio-enabled processor board",
        1,
        850,
        "Spektral analiz ve iletişim",
        "Spectral analysis and communication",
      ],
      [
        "Manyetik montaj, kutu ve pil",
        "Magnetic mount, enclosure and battery",
        1,
        800,
        "Makineye montaj",
        "Mount on machine",
      ],
    ],
  },
];
export function mockBuild(id: string, locale: Locale): BuildEstimate {
  const parsed = Number(id.split("-").at(-1));
  const fallbackIndex =
    [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    profiles.length;
  const p =
    profiles[
      Number.isInteger(parsed) && parsed >= 1 && parsed <= profiles.length
        ? parsed - 1
        : fallbackIndex
    ];
  const [electronics, software, mechanical, manufacturing, testing] =
    p.difficulty;
  const materials = p.parts.map(
    ([tr, en, quantity, estimatedUnitCost, rtr, ren]) => ({
      name: locale === "tr" ? tr : en,
      quantity,
      estimatedUnitCost,
      category: (/sensor|sensör|prob|camera|kamera|encoder|enkoder/i.test(
        `${tr} ${en}`,
      )
        ? "sensors"
        : /board|kart|driver|sürücü|converter|dönüştürücü/i.test(`${tr} ${en}`)
          ? "electronics"
          : /power|pil|battery|güç/i.test(`${tr} ${en}`)
            ? "power"
            : "mechanical") as
        "sensors" | "electronics" | "power" | "mechanical",
      reason: locale === "tr" ? rtr : ren,
      replacementFor: null,
    }),
  );
  const breakdown = {
    electronics,
    software,
    mechanical,
    manufacturing,
    testing,
  };
  return {
    difficulty: calculateDifficulty({
      breakdown,
      reasons: Object.entries(breakdown).map(([area, value]) => ({
        area: area as keyof typeof breakdown,
        reason:
          locale === "tr"
            ? `${area} alanı için ${value}/10 prototip zorluğu öngörülür.`
            : `${value}/10 prototype difficulty is expected for ${area}.`,
      })),
    }),
    cost: calculateCost(
      materials,
      [
        locale === "tr"
          ? "Masaüstü, düşük gerilimli tek prototip varsayılmıştır."
          : "Assumes one low-voltage bench prototype.",
      ],
      locale,
    ),
    materials,
  };
}
