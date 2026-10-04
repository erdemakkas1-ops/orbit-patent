import type { Locale } from "@/types/patent";

export const legalPages = ["sources", "terms", "privacy"] as const;
export type LegalPage = (typeof legalPages)[number];

type Section = { heading: string; paragraphs: string[] };
type Page = { title: string; updated: string; sections: Section[] };

const UPDATED = "2026-10-04";

/**
 * Draft legal copy describing what the site actually does. The operator's
 * identity and contact details are still missing; both are required (KVKK)
 * before launch and the whole text needs a legal review.
 */
export const legalContent: Record<Locale, Record<LegalPage, Page>> = {
  tr: {
    sources: {
      title: "Veri kaynakları",
      updated: UPDATED,
      sections: [
        {
          heading: "Patent verisi",
          paragraphs: [
            "Bibliyografik bilgiler, özetler, çizimler, patent aileleri, hukuki olaylar (INPADOC) ve desteklenen ofisler için istem metinleri Avrupa Patent Ofisi'nin Open Patent Services (EPO OPS) hizmetinden canlı olarak alınır. Her patent sayfasında özgün belgeye Espacenet bağlantısı bulunur.",
            "EPO, ABD yayınları gibi bazı ofisler için istem metni sunmaz; bu durumda sayfada açıkça belirtilir ve tahmin üretilmez.",
          ],
        },
        {
          heading: "Hukuki durum nasıl gösterilir?",
          paragraphs: [
            "Durum ifadeleri sicil kaydını aktarır: “Ücret ödenmediği için düştüğü bildiriliyor” ifadesi, yayın ofisinin kayıtlarında bu yönde bir olay olduğunu anlatır. Hukuki durum ülkeseldir; yalnızca yayının kendi ofisindeki kayıtlar dikkate alınır.",
            "Sicilde kayıt yoksa ve başvurudan bu yana azami koruma süresi (20 yıl, ek koruma ile en fazla 25 yıl) geçmişse “Süresi dolmuş olmalı · tahmini” yazılır. Bu bir tahmindir, sicil kaydı değildir.",
            "Bir patentin sona ermesi, aynı üründeki başka patentlerin, tasarımların veya markaların da sona erdiği anlamına gelmez.",
          ],
        },
        {
          heading: "Yapay zekâ içerikleri",
          paragraphs: [
            "Türkçe çeviriler, sade açıklamalar, korunan kapsam özetleri ve geliştirme hipotezleri bir yapay zekâ modeliyle üretilir ve sayfada öyle etiketlenir. Geliştirme önerileri hipotezdir, olgu değildir.",
          ],
        },
        {
          heading: "Güncellik",
          paragraphs: [
            "Kaynak yükünü azaltmak için patent kayıtları en fazla 7 gün, istem metinleri ve çizimler 30 gün önbellekte tutulabilir. Kesin ve güncel durum için özgün sicile bakılmalıdır.",
          ],
        },
      ],
    },
    terms: {
      title: "Kullanım koşulları",
      updated: UPDATED,
      sections: [
        {
          heading: "Hizmetin niteliği",
          paragraphs: [
            "ORBIT, patentleri keşfetmeye ve teknik fikirleri anlamaya yardımcı olan bir araştırma aracıdır. Hukuki görüş, serbestçe kullanım (FTO) değerlendirmesi, patentlenebilirlik görüşü veya üretim izni değildir.",
            "Üretim, satış veya yatırım kararlarından önce hedef ülkelerdeki ilgili haklar bir uzmana ayrıca inceletilmelidir.",
          ],
        },
        {
          heading: "Yapay zekâ çıktıları",
          paragraphs: [
            "Yapay zekâ çıktıları hata içerebilir. Maliyet tahminleri doğrulanmış piyasa fiyatı değildir; geliştirme önerileri test edilmesi gereken hipotezlerdir.",
          ],
        },
        {
          heading: "Adil kullanım",
          paragraphs: [
            "Hizmeti otomatik araçlarla toplu veri çekmek için kullanmak yasaktır. Yapay zekâ özellikleri kötüye kullanıma karşı hız sınırıyla korunur.",
          ],
        },
        {
          heading: "Sorumluluk",
          paragraphs: [
            "Hizmet “olduğu gibi” sunulur. Veriler üçüncü taraf kaynaklardan gelir; eksiksiz veya güncel olduğu garanti edilmez.",
          ],
        },
      ],
    },
    privacy: {
      title: "Gizlilik ve KVKK",
      updated: UPDATED,
      sections: [
        {
          heading: "Hangi verileri işliyoruz?",
          paragraphs: [
            "Hesap gerekmez; ad, e-posta veya ödeme bilgisi toplanmaz. Çerez ya da reklam izleyicisi kullanılmaz.",
            "AI proje aramasına yazdığın proje açıklaması ve Geliştir bölümüne yazdığın problem, yanıt üretmek için yapay zekâ sağlayıcısına (OpenAI) iletilir. Bu metinler ortak kalıcı önbelleğe kaydedilmez ve başka kullanıcıların sonuçlarında görünmez.",
            "Kötüye kullanımı önlemek için IP adresi, hız sınırı amacıyla kısa süreliğine bellekte tutulur. Barındırma sağlayıcısı (Vercel) standart erişim kayıtları tutabilir.",
          ],
        },
        {
          heading: "Veri sorumlusu ve başvuru",
          paragraphs: [
            "Veri sorumlusunun unvanı ve iletişim bilgileri yayından önce bu bölüme eklenecektir. KVKK'nın 11. maddesindeki haklarını bu iletişim kanalı üzerinden kullanabilirsin.",
          ],
        },
      ],
    },
  },
  en: {
    sources: {
      title: "Data sources",
      updated: UPDATED,
      sections: [
        {
          heading: "Patent data",
          paragraphs: [
            "Bibliographic data, abstracts, drawings, patent families, legal events (INPADOC) and, for supported offices, claim text come live from the European Patent Office's Open Patent Services (EPO OPS). Every patent page links to the original document on Espacenet.",
            "The EPO provides no claim text for some offices, such as US publications; the page says so and no estimate is produced.",
          ],
        },
        {
          heading: "How legal status is shown",
          paragraphs: [
            "Status wording reports the register: “reported lapsed for non-payment of fees” means the publishing office recorded such an event. Legal status is national; only records of the publication's own office count.",
            "When the register is silent and the maximum term (20 years, at most 25 with supplementary protection) has passed since filing, the page shows “Likely expired · estimate”. That is an estimate, not a register record.",
            "A patent ending does not mean other patents, designs or trademarks on the same product have ended.",
          ],
        },
        {
          heading: "AI content",
          paragraphs: [
            "Turkish translations, plain-language explanations, claim scope summaries and development hypotheses are produced by an AI model and labelled as such. Development ideas are hypotheses, not facts.",
          ],
        },
        {
          heading: "Freshness",
          paragraphs: [
            "To limit load on the source, patent records may be cached for up to 7 days, claims and drawings for 30 days. Check the original register for the definitive current status.",
          ],
        },
      ],
    },
    terms: {
      title: "Terms of use",
      updated: UPDATED,
      sections: [
        {
          heading: "What the service is",
          paragraphs: [
            "ORBIT is a research tool for exploring patents and understanding technical ideas. It is not legal advice, a freedom-to-operate (FTO) assessment, a patentability opinion or a licence to manufacture.",
            "Before manufacturing, selling or investing, have the relevant rights in your target countries reviewed by a professional.",
          ],
        },
        {
          heading: "AI output",
          paragraphs: [
            "AI output can be wrong. Cost estimates are not verified market prices; development suggestions are hypotheses to be tested.",
          ],
        },
        {
          heading: "Fair use",
          paragraphs: [
            "Do not use the service to scrape data in bulk with automated tools. AI features are rate limited against abuse.",
          ],
        },
        {
          heading: "Liability",
          paragraphs: [
            "The service is provided “as is”. Data comes from third-party sources and is not guaranteed to be complete or current.",
          ],
        },
      ],
    },
    privacy: {
      title: "Privacy",
      updated: UPDATED,
      sections: [
        {
          heading: "What we process",
          paragraphs: [
            "No account is needed; no name, email or payment details are collected. No cookies or advertising trackers are used.",
            "The project you describe in AI project search and the problem you write in Develop are sent to the AI provider (OpenAI) to produce an answer. They are never stored in the shared durable cache and never appear in anyone else's results.",
            "To prevent abuse, IP addresses are held briefly in memory for rate limiting. The hosting provider (Vercel) may keep standard access logs.",
          ],
        },
        {
          heading: "Controller and requests",
          paragraphs: [
            "The data controller's name and contact details will be added here before launch; use that channel to exercise your data protection rights.",
          ],
        },
      ],
    },
  },
};
