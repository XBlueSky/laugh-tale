import { validateTrip } from "@laugh-tale-island/core";
import { describe, expect, it } from "vitest";

import resolved from "./resolved-places.json";
import source from "./source/tokyo-itinerary.json";
import { asResolvedPlaces, assertSourceItinerary } from "./source/types";
import { buildTokyoTrip, tokyoTrip } from "./tokyo-trip";

// Transcribed from the approved itinerary independently of tokyo-itinerary.json.
const EXPECTED_DAY_TITLES: string[][] = [
  ["成田國際機場第二航廈", "三井花園飯店日本橋普米爾", "海鮮居酒屋・墨之榮"],
  [
    "三井花園飯店日本橋普米爾",
    "東京車站",
    "Fuji TV Shop Fuji-san Tokyo Station",
    "BicCamera 有樂町店",
    "迴轉壽司 根室花丸 銀座店",
    "無印良品 銀座旗艦店",
    "樂天免稅店 東京銀座店",
    "GINZA SIX",
    "Uniqlo Ginza Flagship Store",
    "和光 銀座別館茶沙龍",
    "銀座三越",
    "松屋銀座",
    "唐吉訶德 銀座本店",
    "三井花園飯店日本橋普米爾",
    "極味屋 東京站店",
    "東京 禮物調色盤",
    "東京站一番街",
    "PRESS BUTTER SAND Daimaru Tokyo",
    "東京鬱金香玫瑰 東京站店",
    "楓糖男孩 The Maple mania GRANATA東京店",
    "Koroan KOURO - AN Guransutatokyoten",
    "GRANSTA東京·GRANSTA丸之內",
    "三井花園飯店日本橋普米爾",
  ],
  [
    "三井花園飯店日本橋普米爾",
    "Balcony by 6th",
    "Pelican Cafe",
    "東京麻布台之丘",
    "麻布台之丘 花園廣場C",
    "Échiré L'Atelier du Beurre",
    "麻布台山市場",
    "鈴懸 麻布台之丘店",
    "teamLab Borderless 數位藝術美術館",
    "芝給水所公園",
    "麻布十番商店街",
    "Hills House Sky Room Café&Bar",
    "麻布台之丘 Azabudai Hills",
    "三井花園飯店日本橋普米爾",
  ],
  [
    "三井花園飯店日本橋普米爾",
    "淺草寺 雷門",
    "淺草吉備糰子 AZUMA",
    "仲見世商店街",
    "木村家人形燒本舖",
    "淺草寺",
    "天婦羅 大黑家 本店",
    "淺草炸肉餅",
    "淺草今半 松屋淺草店",
    "銅鑼燒 龜十",
    "隅田公園 (淺草側)",
    "隅田川步道",
    "東京水岸街道 (Tokyo Mizumachi)",
    "東京晴空街道 TOKYO Solamachi",
    "東京晴空塔LOFT",
    "ちいかわらんど 東京スカイツリータウン・ソラマチ店",
    "JUMP SHOP Tokyo Skytree Town Soramachi",
    "Skytree Cafe 350",
    "Tokyo Sky Tree Tembo Galleria",
    "上野阿美橫町",
    "上野LOFT",
    "名代 宇奈とと",
    "OS Drug 上野店藥妝店",
    "阿美橫百果園",
    "Minatoya",
    "二木菓子 第一營業所",
    "唐吉訶德 御徒町店",
    "Maruetsu petit Nihonbashihoncho",
    "三井花園飯店日本橋普米爾",
  ],
  [
    "三井花園飯店日本橋普米爾",
    "明治神宮",
    "＠cosme TOKYO",
    "AFURI Harajuku",
    "WITH原宿",
    "竹下通",
    "BEAMS 原宿",
    "HOKA 原宿店",
    "東急廣場原宿「HARAKADO原角」",
    "ONE PIECE MUGIWARA STORE HARAJUKU",
    "東急Plaza表參道原宿",
    "Chiikawa Bakery",
    "Onitsuka Tiger NIPPON MADE 表參道店",
    "Cat St",
    "表參道Hills",
    "House of Herme",
    "LE LABO 青山店",
    "宮下公園",
    "迪士尼商店 澀谷公園大道店",
    "澀谷PARCO",
    "西班牙坂",
    "MEGA唐吉訶德 澀谷本店",
    "西武澀谷店",
    "渋谷スクランブル交差点",
    "忠犬八公像",
    "澀谷 SKY",
    "澀谷線流",
    "Gyutan Sumiyaki Rikyu Shibuya Hikarie Branch",
    "三井花園飯店日本橋普米爾",
  ],
  ["三井花園飯店日本橋普米爾", "成田機場第二航廈"],
];

const records = asResolvedPlaces(resolved);

describe("tokyoTrip", () => {
  it("preserves the user-confirmed identity, dates, and exact order", () => {
    expect(tokyoTrip.title).toBe("26東京偷尼生日");
    expect(tokyoTrip.timezone).toBe("Asia/Tokyo");
    expect(tokyoTrip.startDate).toBe("2026-08-20");
    expect(tokyoTrip.endDate).toBe("2026-08-25");
    expect(tokyoTrip.days.map((day) => day.date)).toEqual([
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
    ]);
    expect(tokyoTrip.days.map((day) => day.nodes.map((node) => node.title))).toEqual(EXPECTED_DAY_TITLES);
    expect(tokyoTrip.days.map((day) => day.nodes.length)).toEqual([3, 23, 14, 29, 29, 2]);
  });

  it("uses stable IDs, unknown timing, and no invented facts", () => {
    const nodes = tokyoTrip.days.flatMap((day) => day.nodes);
    expect(nodes).toHaveLength(100);
    expect(new Set(nodes.map((node) => node.id)).size).toBe(100);
    tokyoTrip.days.forEach((day, dayIndex) => {
      day.nodes.forEach((node, nodeIndex) => {
        expect(node.dayId).toBe(day.id);
        expect(node.id).toMatch(
          new RegExp(`^d${dayIndex + 1}-s${String(nodeIndex + 1).padStart(2, "0")}-[a-z0-9]+(?:-[a-z0-9]+)*$`),
        );
        expect(node.timing).toEqual({ certainty: "unknown" });
        expect(node.optionality).toBe("core");
        expect(node.booking).toBeUndefined();
      });
    });
    expect(tokyoTrip.candidateGroups).toEqual([]);
    expect(tokyoTrip.reservations).toEqual([]);
    expect(tokyoTrip.tasks).toEqual([]);
  });

  it("derives one route edge per leg with a supplied mode and none for unknown legs", () => {
    const itinerary = assertSourceItinerary(source);
    const expectedEdges = itinerary.days.flatMap((day, dayIndex) =>
      day.legs.flatMap((mode, legIndex) => {
        if (mode === "unknown") return [];
        const from = tokyoTrip.days[dayIndex].nodes[legIndex];
        const to = tokyoTrip.days[dayIndex].nodes[legIndex + 1];
        return [
          {
            id: `leg:${day.id}-${String(legIndex + 1).padStart(2, "0")}`,
            dayId: day.id,
            fromNodeId: from.id,
            toNodeId: to.id,
            mode,
            source: "manual",
            certainty: "confirmed",
            navigation: { origin: from.title, destination: to.title },
          },
        ];
      }),
    );
    expect(tokyoTrip.routes).toEqual(expectedEdges);
    expect(tokyoTrip.routes).toHaveLength(92);
    for (const edge of tokyoTrip.routes) {
      expect(edge.durationMinutes).toBeUndefined();
      expect(edge.distanceMeters).toBeUndefined();
      expect(edge.summary).toBeUndefined();
    }
  });

  it("marks places as suggested only when resolved, otherwise unverified without coordinates", () => {
    for (const node of tokyoTrip.days.flatMap((day) => day.nodes)) {
      const record = records[node.title];
      if (record?.status === "resolved") {
        expect(node.place).toEqual({
          name: node.title,
          coordinates: { lat: record.lat, lng: record.lng },
          provider: { name: "google", placeId: record.placeId },
          certainty: "suggested",
        });
      } else {
        expect(node.place).toEqual({ name: node.title, certainty: "unverified" });
      }
    }
  });

  it("passes core validation with only unresolved-place warnings", () => {
    const validation = validateTrip(tokyoTrip);
    expect(validation.errors).toEqual([]);
    expect(new Set(validation.warnings.map((warning) => warning.code))).toEqual(new Set(["UNRESOLVED_PLACE"]));
  });

  it("rejects a leg list of the wrong length", () => {
    const broken = structuredClone(source) as { days: { legs: string[] }[] };
    broken.days[0].legs.push("walking");
    expect(() => buildTokyoTrip(assertSourceItinerary(broken), {})).toThrow(/legs/);
  });
});
