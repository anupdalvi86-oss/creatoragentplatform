import { useEffect, useMemo, useState } from "react";
import type {
  ContentItem,
  Creator,
  GroundedAnswer,
  Ingredient,
  RecipeMeta,
} from "../shared/types";
import { estimateNutrition, matchPantryRecipes, parseNutritionIngredients, recipeDifficulty } from "./nutrition";

type Screen =
  | "home"
  | "can-make"
  | "plan"
  | "grocery"
  | "nutrition"
  | "source"
  | "preferences"
  | "saved";
type Plan = {
  id: string;
  mealType: "dinner" | "lunch";
  items: Array<{ day: number; content: ContentItem; servings: number }>;
  requestedDays: number;
  previewDays: number;
  gate?: { paywallContext: string };
};
type MealSlot = "breakfast" | "lunch" | "snack" | "dinner";
type MealPlanEntry = {
  id: string;
  day: number;
  mealType: MealSlot;
  content: ContentItem;
};
type EditableIngredient = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  checked: boolean;
};
type Language = "en" | "hi";
type Shopping = {
  id?: string;
  items?: Array<{
    id: string;
    ingredient: string;
    quantity: number;
    unit: string;
    category: string;
    checked: number;
  }>;
  type?: string;
  previewData?: { count: number; items: Ingredient[] };
  paywallContext?: string;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};
type SpeechRecognitionLike = {
  lang: string;
  start: () => void;
  onresult:
    | ((event: {
        results: ArrayLike<ArrayLike<{ transcript: string }>>;
      }) => void)
    | null;
  onerror: (() => void) | null;
};

const creatorRoute = location.pathname.match(/^\/creator\/([a-z0-9-]+)$/i)?.[1];
const requestedCreatorSlug = new URLSearchParams(location.search).get("creator");
const isStandaloneApp = window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;
let lastCreatorSlug = "";
try {
  lastCreatorSlug = localStorage.getItem("cap-last-creator") || "";
} catch {
  // Storage may be unavailable in restricted browser contexts.
}
const slug = creatorRoute || (
  isStandaloneApp && (!requestedCreatorSlug || requestedCreatorSlug === "anyone-can-cook-demo") && lastCreatorSlug
    ? lastCreatorSlug
    : requestedCreatorSlug || "anyone-can-cook-demo"
);
const base = `/api/${encodeURIComponent(slug)}`;
const hindiIngredientNames: Record<string, string> = {
  salt: "नमक",
  semolina: "सूजी",
  "wheat flour": "गेहूँ का आटा",
  flour: "आटा",
  sugar: "चीनी",
  ghee: "घी",
  rice: "चावल",
  potato: "आलू",
  onion: "प्याज़",
  tomato: "टमाटर",
  garlic: "लहसुन",
  ginger: "अदरक",
  paneer: "पनीर",
  yogurt: "दही",
  curd: "दही",
  milk: "दूध",
  cream: "मलाई",
  butter: "मक्खन",
  chickpeas: "छोले",
  lentils: "दाल",
  cardamom: "इलायची",
  saffron: "केसर",
  cumin: "जीरा",
  coriander: "धनिया",
  "bell pepper": "शिमला मिर्च",
  pepper: "काली मिर्च",
  cinnamon: "दालचीनी",
  cashew: "काजू",
  almonds: "बादाम",
  pistachio: "पिस्ता",
  coconut: "नारियल",
  banana: "केला",
  dates: "खजूर",
  oil: "तेल",
  water: "पानी",
  cucumber: "खीरा",
  tortilla: "रोटी",
  spinach: "पालक",
  cauliflower: "फूलगोभी",
  okra: "भिंडी",
  eggplant: "बैंगन",
  cabbage: "पत्ता गोभी",
  carrot: "गाजर",
  peas: "मटर",
  "green beans": "हरी फलियां",
  "green chili": "हरी मिर्च",
  "curry leaves": "करी पत्ता",
  cilantro: "हरा धनिया",
  mint: "पुदीना",
  "basmati rice": "बासमती चावल",
  poha: "पोहा",
  "flattened rice": "चिवड़ा",
  oats: "ओट्स",
  millet: "बाजरा",
  "ragi flour": "रागी का आटा",
  besan: "बेसन",
  "toor dal": "तूर दाल",
  "moong dal": "मूंग दाल",
  "chana dal": "चना दाल",
  "urad dal": "उड़द दाल",
  "kidney beans": "राजमा",
  peanuts: "मूंगफली",
  eggs: "अंडे",
  egg: "अंडा",
  chicken: "चिकन",
  shrimp: "झींगा",
  turmeric: "हल्दी",
  "garam masala": "गरम मसाला",
  "chili powder": "लाल मिर्च पाउडर",
  "mustard seeds": "राई",
  clove: "लौंग",
  cloves: "लौंग",
  "ginger garlic paste": "अदरक-लहसुन पेस्ट",
  "mustard oil": "सरसों का तेल",
  tamarind: "इमली",
  jaggery: "गुड़",
  lemon: "नींबू",
  lime: "नींबू",
  pumpkin: "कद्दू",
  "bottle gourd": "लौकी",
  "bitter gourd": "करेला",
  zucchini: "ज़ुकीनी",
  corn: "मक्का",
  pasta: "पास्ता",
  paprika: "पपरिका",
  "white beans": "सफेद बीन्स",
};
const PANTRY_INGREDIENT_GROUPS = [
  {
    id: "vegetables",
    icon: "🥬",
    title: "Vegetables & greens",
    titleHi: "सब्ज़ियां और साग",
    ingredients: ["onion", "tomato", "potato", "spinach", "cauliflower", "okra", "eggplant", "cabbage", "carrot", "peas", "green beans", "bell pepper", "cucumber", "pumpkin", "bottle gourd", "bitter gourd", "zucchini", "green chili", "corn"],
  },
  {
    id: "grains",
    icon: "🌾",
    title: "Grains & breads",
    titleHi: "अनाज और रोटियां",
    ingredients: ["rice", "basmati rice", "wheat flour", "semolina", "poha", "flattened rice", "oats", "millet", "ragi flour", "besan", "roti", "tortilla", "pasta"],
  },
  {
    id: "pulses",
    icon: "🫘",
    title: "Dals, beans & nuts",
    titleHi: "दालें, बीन्स और मेवे",
    ingredients: ["lentils", "toor dal", "moong dal", "chana dal", "urad dal", "chickpeas", "kidney beans", "white beans", "black beans", "peanuts", "cashew", "almonds"],
  },
  {
    id: "dairy",
    icon: "🥛",
    title: "Dairy & protein",
    titleHi: "डेयरी और प्रोटीन",
    ingredients: ["paneer", "yogurt", "curd", "milk", "cream", "ghee", "butter", "eggs", "egg", "chicken", "shrimp"],
  },
  {
    id: "spices",
    icon: "🌶️",
    title: "Spices & herbs",
    titleHi: "मसाले और हर्ब्स",
    ingredients: ["turmeric", "cumin", "coriander", "garam masala", "chili powder", "mustard seeds", "cardamom", "cinnamon", "clove", "ginger", "garlic", "ginger garlic paste", "curry leaves", "cilantro", "mint", "paprika"],
  },
  {
    id: "staples",
    icon: "🫙",
    title: "Oils & pantry staples",
    titleHi: "तेल और रसोई की ज़रूरी चीज़ें",
    ingredients: ["oil", "mustard oil", "olive oil", "coconut", "tamarind", "jaggery", "salt", "sugar", "lemon", "lime", "water"],
  },
];
const hindiUnitNames: Record<string, string> = {
  cup: "कप",
  cups: "कप",
  g: "ग्राम",
  gm: "ग्राम",
  grams: "ग्राम",
  kg: "किलो",
  ml: "मिलीलीटर",
  tsp: "छोटा चम्मच",
  tbsp: "बड़ा चम्मच",
  each: "पीस",
  piece: "पीस",
  "to taste": "स्वादानुसार",
  "as needed": "ज़रूरत के मुताबिक",
};
function localizedIngredient(value: string, language: Language): string {
  if (language === "en") return value;
  const key = value.toLowerCase().replace(/,\s*(cooked|raw)$/i, "").trim();
  return hindiIngredientNames[key] || value;
}
function canonicalIngredient(value: string, language: Language): string {
  if (language === "en") return value;
  return Object.entries(hindiIngredientNames).find(([, hindi]) => hindi === value)?.[0] || value;
}
function localizedUnit(value: string, language: Language): string {
  if (language === "en") return value;
  return hindiUnitNames[value.toLowerCase()] || value;
}
function canonicalUnit(value: string, language: Language): string {
  if (language === "en") return value;
  return Object.entries(hindiUnitNames).find(([, hindi]) => hindi === value)?.[0] || value;
}
function localizedEquipment(value: string, language: Language): string {
  if (language === "en") return value;
  const names: Record<string, string> = {
    oven: "oven",
    stovetop: "gas/stove",
    "air fryer": "air fryer",
  };
  return names[value.toLowerCase()] || value;
}
function creatorDisplayName(name: string): string {
  return name.trim() || "Kitchen Companion";
}
function creatorKitchenHero(name: string): string {
  return `Welcome to ${creatorDisplayName(name)}’s Kitchen`;
}
function creatorInitials(name: string): string {
  const words = creatorDisplayName(name)
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return (words.length > 1
    ? `${words[0]?.[0] || ""}${words[1]?.[0] || ""}`
    : words[0]?.slice(0, 2) || "KC").toUpperCase();
}
function isDinnerCandidate(item: ContentItem): boolean {
  const searchableText = `${item.title} ${item.description} ${item.tags.join(" ")}`;
  return (
    !["side", "lunch"].includes(item.meta.mealType || "main") &&
    !/\b(cake|cakes|pastry|pastries|dessert|desserts|sweet|sweets|cookie|cookies|brownie|brownies|muffin|muffins|cupcake|cupcakes|donut|donuts|ice cream|kheer|halwa|ladoo|laddu|barfi|modak|pudding|chocolate|snack|energy bars?)\b/i.test(
      searchableText,
    )
  );
}
function localizedChip(value: string, language: Language): string {
  if (language === "en") return value;
  const labels: Record<string, string> = {
    Quick: "जल्दी",
    Healthy: "स्वस्थ",
    "High protein": "ज्यादा प्रोटीन",
    "Kids/tiffin": "बच्चों का टिफिन",
    Vegetarian: "शाकाहारी",
    "No oven": "बिना ओवन",
    "Air fryer": "एयर फ्रायर",
  };
  return labels[value] || value;
}
async function api<T>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    credentials: "same-origin",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}
function RecipeCard({
  item,
  onOpen,
  why,
  language = "en",
}: {
  item: ContentItem;
  onOpen: () => void;
  why?: string;
  language?: Language;
}) {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const derivedThumbnail = item.sourceUrl.match(
    /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/,
  )?.[1]
    ? `https://i.ytimg.com/vi/${item.sourceUrl.match(
        /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/,
      )?.[1]}/hqdefault.jpg`
    : null;
  const thumbnail = item.thumbnailUrl || derivedThumbnail;
  const sourceLabel =
    item.provenance.kind === "illustrative"
      ? language === "hi" ? "सैंपल व्यंजन" : "SAMPLE IDEA"
      : item.meta.ingredients.length
        ? language === "hi" ? "रेसिपी" : "RECIPE"
        : language === "hi" ? "वीडियो" : "VIDEO";
  const detailLabel = item.meta.minutes
    ? `${item.meta.minutes} ${language === "hi" ? "मिनट" : "MIN"}`
    : language === "hi" ? "वीडियो" : "VIDEO";
  const nutrition = estimateNutrition(item.meta);
  const nutritionUnavailable = !item.meta.ingredients.length
    ? (language === "hi"
        ? item.meta.ingredientHints?.length ? "मात्राएं नहीं दी गईं" : "सामग्री सूची उपलब्ध नहीं"
        : item.meta.ingredientHints?.length ? "Amounts not provided" : "Ingredient list unavailable")
    : (language === "hi" ? "पोषण अनुमान उपलब्ध नहीं" : "Nutrition estimate unavailable");
  const mark =
    item.meta.ingredients[0]?.name === "paneer"
      ? "◒"
      : item.meta.ingredients[0]?.name === "potato"
        ? "◌"
        : "✦";
  return (
    <button className="recipe-card" onClick={onOpen} type="button">
      <span className="recipe-art" aria-hidden="true">
        {thumbnail && !thumbnailFailed ? (
          <img
            src={thumbnail}
            alt=""
            loading="lazy"
            onError={() => setThumbnailFailed(true)}
          />
        ) : (
          <span>{mark}</span>
        )}
      </span>
      <span className="recipe-body">
        <span className="eyebrow">
          {sourceLabel} · {detailLabel}
        </span>
        <strong title={item.title}>{item.title}</strong>
        <small>{why || item.description}</small>
        <span className="recipe-nutrition-strip">
          {nutrition.complete
            ? (language === "hi"
                ? `प्रति सर्विंग · ${nutrition.basis === "estimated" ? "≈ " : ""}${nutrition.perServing.calories} kcal · प्रोटीन ${nutrition.perServing.protein} g · कार्ब्स ${nutrition.perServing.carbs} g · वसा ${nutrition.perServing.fat} g`
                : `Per serving · ${nutrition.basis === "estimated" ? "≈ " : ""}${nutrition.perServing.calories} kcal · ${nutrition.perServing.protein} g protein · ${nutrition.perServing.carbs} g carbs · ${nutrition.perServing.fat} g fat`)
            : nutritionUnavailable}
        </span>
        <span className="tag-row">
          {item.tags.slice(0, 2).map((tag) => (
            <em key={tag}>{tag}</em>
          ))}
        </span>
      </span>
      <span className="card-arrow">↗</span>
    </button>
  );
}

function RecipeOverview({
  meta,
  language,
}: {
  meta: RecipeMeta;
  language: Language;
}) {
  const nutrition = estimateNutrition(meta);
  const difficulty = recipeDifficulty(meta);
  const hindi = language === "hi";
  const unavailableReason = !meta.ingredients.length
    ? (meta.ingredientHints?.length
        ? (hindi
            ? "स्रोत में सामग्री का उल्लेख है, लेकिन सटीक मात्रा नहीं है। इसलिए पोषण का अनुमान नहीं लगाया गया।"
            : "The source mentions ingredients but gives no exact amounts, so nutrition is not estimated.")
        : (hindi
            ? "स्रोत में उपयोग करने योग्य सामग्री सूची नहीं है, इसलिए पोषण का अनुमान नहीं लगाया जा सकता।"
            : "The source has no usable ingredient list, so nutrition cannot be estimated."))
    : (hindi
        ? `इन सामग्रियों के लिए पोषण डेटा या समर्थित मात्रा उपलब्ध नहीं है${nutrition.unestimated.length ? `: ${nutrition.unestimated.join(", ")}` : "।"}`
        : `Nutrition data or a supported unit is missing for${nutrition.unestimated.length ? `: ${nutrition.unestimated.join(", ")}` : " one or more ingredients."}`);
  const facts = [
    { label: hindi ? "कठिनाई" : "Difficulty", value: hindi ? ({ Easy: "आसान", Medium: "मध्यम", Hard: "कठिन" }[difficulty]) : difficulty },
    { label: hindi ? "तैयारी का समय" : "Prep. time", value: meta.prepMinutes ?? meta.minutes ? `${meta.prepMinutes ?? meta.minutes} ${hindi ? "मिनट" : "min"}` : "—" },
    { label: hindi ? "कैलोरी" : "Calories", value: nutrition.complete ? `${nutrition.perServing.calories} kcal` : "—" },
  ];
  const macros = [
    { label: hindi ? "प्रोटीन" : "Protein", value: nutrition.complete ? `${nutrition.perServing.protein} g` : "—", icon: "◉" },
    { label: hindi ? "कार्ब्स" : "Carbs", value: nutrition.complete ? `${nutrition.perServing.carbs} g` : "—", icon: "◌" },
    { label: hindi ? "फैट" : "Fat", value: nutrition.complete ? `${nutrition.perServing.fat} g` : "—", icon: "◒" },
  ];
  return (
    <section className="recipe-overview" aria-label={hindi ? "पोषण और रेसिपी सारांश" : "Nutrition and recipe overview"}>
      <div className="recipe-overview-top">
        {facts.map((fact) => (
          <div className="overview-fact" key={fact.label}>
            <span>{fact.label}</span>
            <strong>{fact.value}</strong>
          </div>
        ))}
        <div className="overview-fact">
          <span>{hindi ? "सर्विंग" : "Servings"}</span>
          <strong>{meta.servings}</strong>
        </div>
      </div>
      <div className="recipe-macros">
        {macros.map((macro) => (
          <div className="macro-card" key={macro.label}>
            <span className="macro-icon" aria-hidden="true">{macro.icon}</span>
            <span>{macro.label}</span>
            <strong>{macro.value}</strong>
          </div>
        ))}
      </div>
      <p className="nutrition-note">
        {nutrition.basis === "provided"
          ? (meta.nutritionSource
              ? `${hindi ? "प्रति सर्विंग पोषण · स्रोत:" : "Nutrition per serving · source:"} ${meta.nutritionSource}`
              : (hindi ? "दिए गए पोषण मान प्रति सर्विंग हैं।" : "Nutrition values supplied per serving."))
          : nutrition.complete
            ? (hindi
                ? `प्रति सर्विंग अनुमान · ${meta.servings} सर्विंग · सामग्री औसत पर आधारित`
                : `Estimated per serving · ${meta.servings} servings · based on generic ingredient averages`)
            : unavailableReason}
      </p>
    </section>
  );
}

export default function App() {
  const [creator, setCreator] = useState<Creator | null>(null);
  const [content, setContent] = useState<ContentItem[]>([]);
  const [screen, setScreen] = useState<Screen>("home");
  const [nutritionRecipeId, setNutritionRecipeId] = useState("");
  const [nutritionName, setNutritionName] = useState("");
  const [nutritionServings, setNutritionServings] = useState(2);
  const [nutritionIngredientText, setNutritionIngredientText] = useState("");
  const [customNutritionMeta, setCustomNutritionMeta] = useState<RecipeMeta | null>(null);
  const [pantryIngredients, setPantryIngredients] = useState<string[]>([]);
  const [pantrySearch, setPantrySearch] = useState("");
  const [selected, setSelected] = useState<ContentItem | null>(null);
  const [query, setQuery] = useState("");
  const [goal, setGoal] = useState("");
  const [ingredients] = useState("");
  const [equipment, setEquipment] = useState<string[]>([]);
  const [diet, setDiet] = useState<string[]>([]);
  const [familySize, setFamilySize] = useState(2);
  const [maxMinutes, setMaxMinutes] = useState(30);
  const [spicePreference, setSpicePreference] = useState<
    "mild" | "medium" | "hot"
  >("medium");
  const [days, setDays] = useState(5);
  const [mealType, setMealType] = useState<"dinner" | "lunch">("dinner");
  const [dislikedIngredients, setDislikedIngredients] = useState("");
  const [childAgeRanges, setChildAgeRanges] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [mealPlanEntries, setMealPlanEntries] = useState<MealPlanEntry[]>([]);
  const [mealSlot, setMealSlot] = useState<MealSlot>("dinner");
  const [mealDay, setMealDay] = useState(3);
  const [catalogRecipeId, setCatalogRecipeId] = useState("");
  const [mealPlanMessage, setMealPlanMessage] = useState("");
  const [ingredientDrafts, setIngredientDrafts] = useState<EditableIngredient[]>([]);
  const [shopping, setShopping] = useState<Shopping | null>(null);
  const [savedItems, setSavedItems] = useState<ContentItem[]>([]);
  const [savedLimit, setSavedLimit] = useState<number | null>(5);
  const [savedGate, setSavedGate] = useState("");
  const [language, setLanguage] = useState<Language>("en");
  const [editingFavourites, setEditingFavourites] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api<Creator>("/config"),
      api<{ items: ContentItem[] }>("/content"),
    ])
      .then(([c, items]) => {
        setCreator(c);
        setContent(items.items);
        try {
          localStorage.setItem("cap-last-creator", c.slug);
        } catch {
          // Keep the app usable if storage is disabled.
        }
        document.title = creatorDisplayName(c.name);
        document
          .querySelector('meta[name="description"]')
          ?.setAttribute("content", c.brand.disclaimer || "Creator kitchen workspace");
        document
          .querySelector('meta[name="theme-color"]')
          ?.setAttribute("content", c.brand.accent);
        api<{
          familySize?: number;
          diet?: string[];
          equipment?: string[];
          spicePreference?: "mild" | "medium" | "hot";
          dislikedIngredients?: string[];
          childAgeRanges?: string[];
        }>("/preferences")
          .then(async (preferences) => {
            if (preferences.familySize) setFamilySize(preferences.familySize);
            if (preferences.diet) setDiet(preferences.diet);
            if (preferences.equipment) setEquipment(preferences.equipment);
            if (preferences.spicePreference)
              setSpicePreference(preferences.spicePreference);
            if (preferences.dislikedIngredients)
              setDislikedIngredients(
                preferences.dislikedIngredients.join(", "),
              );
            if (preferences.childAgeRanges)
              setChildAgeRanges(preferences.childAgeRanges.join(", "));
            const saved = await api<{
              items: ContentItem[];
              limit: number | null;
            }>("/saved");
            setSavedItems(saved.items);
            setSavedLimit(saved.limit);
            return api("/event", "POST", { type: "page_view" });
          })
          .catch(() => undefined);
        document.documentElement.style.setProperty("--accent", c.brand.accent);
        const savedPlan = localStorage.getItem(`cap-plan-${slug}`);
        if (savedPlan)
          api<Plan>(`/plan/${savedPlan}`)
            .then((restored) => {
              setPlan(restored);
              setMealType(restored.mealType);
            })
            .catch(() => localStorage.removeItem(`cap-plan-${slug}`));
        const sourceId = location.pathname.match(
          /^\/source\/([a-zA-Z0-9-]+)$/,
        )?.[1];
        if (sourceId) {
          const source = items.items.find((item) => item.id === sourceId);
          if (source) {
            setSelected(source);
            setScreen("source");
          }
        }
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    const stored = localStorage.getItem(`cap-language-${slug}`);
    if (stored === "hi") setLanguage("hi");
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  useEffect(() => {
    function syncFromHistory(event: PopStateEvent) {
      const historyScreen = (event.state as { screen?: Screen } | null)
        ?.screen;
      if (historyScreen && historyScreen !== "source") {
        setSelected(null);
        setScreen(historyScreen);
        setError("");
        window.scrollTo({ top: 0, behavior: "auto" });
        return;
      }
      const sourceId = location.pathname.match(
        /^\/source\/([a-zA-Z0-9-]+)$/,
      )?.[1];
      if (sourceId) {
        const source = content.find((item) => item.id === sourceId);
        if (source) {
          setSelected(source);
          setScreen("source");
          return;
        }
      }
      setSelected(null);
      setScreen("home");
      setError("");
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, [content]);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`cap-meal-plan-${slug}`);
      if (stored) setMealPlanEntries(JSON.parse(stored) as MealPlanEntry[]);
    } catch {
      localStorage.removeItem(`cap-meal-plan-${slug}`);
    }
  }, []);
  useEffect(() => {
    if (!selected) {
      setIngredientDrafts([]);
      return;
    }
    const fallback = [
      ...selected.meta.ingredients.map((ingredient) => ({
        id: `ingredient-${ingredient.name}`,
        name: ingredient.name,
        quantity: String(ingredient.quantity),
        unit: ingredient.unit,
        checked: false,
      })),
      ...(selected.meta.ingredientHints || []).map((name) => ({
        id: `hint-${name}`,
        name,
        quantity: "",
        unit: "to taste",
        checked: false,
      })),
    ];
    try {
      const stored = localStorage.getItem(
        `cap-ingredients-${slug}-${selected.id}`,
      );
      setIngredientDrafts(
        stored ? (JSON.parse(stored) as EditableIngredient[]) : fallback,
      );
    } catch {
      setIngredientDrafts(fallback);
    }
  }, [selected?.id]);
  const filtered = useMemo(
    () =>
      content.filter((item) =>
        `${item.title} ${item.description} ${item.tags.join(" ")} ${item.meta.ingredients.map((ingredient) => ingredient.name).join(" ")} ${(item.meta.ingredientHints || []).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [content, query],
  );
  const catalogRecipes = useMemo(
    () => content.filter((item) => item.meta.ingredients.length > 0),
    [content],
  );
  const pantryRecipes = useMemo(
    () => content.filter((item) => item.meta.ingredients.length > 0 || (item.meta.ingredientHints?.length ?? 0) > 0 || Boolean(item.description.trim())),
    [content],
  );
  const availablePantryIngredients = useMemo(() => {
    const ingredients = new Map<string, string>();
    for (const recipe of pantryRecipes) {
      const names = [
        ...recipe.meta.ingredients.map((ingredient) => ingredient.name),
        ...(recipe.meta.ingredientHints || []),
      ];
      for (const name of names) {
        const key = name.toLowerCase().trim();
        if (key && !ingredients.has(key)) ingredients.set(key, name);
      }
    }
    return [...ingredients.values()].sort((left, right) => left.localeCompare(right));
  }, [pantryRecipes]);
  const pantryMatches = useMemo(
    () => matchPantryRecipes(pantryRecipes, pantryIngredients),
    [pantryRecipes, pantryIngredients],
  );
  useEffect(() => {
    if (!query.trim() || !creator) return;
    const timer = setTimeout(
      () =>
        api("/event", "POST", {
          type: "search",
          resultCount: filtered.length,
        }).catch(() => undefined),
      500,
    );
    return () => clearTimeout(timer);
  }, [query, filtered.length, creator]);
  function open(item: ContentItem) {
    api("/event", "POST", { type: "content_open", contentId: item.id }).catch(
      () => undefined,
    );
    setSelected(item);
    setScreen("source");
    setError("");
    history.pushState(
      { screen: "source" },
      "",
      `/source/${encodeURIComponent(item.id)}${location.search || `?creator=${encodeURIComponent(slug)}`}`,
    );
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function navigate(next: Screen) {
    setScreen(next);
    setError("");
    const nextUrl = creatorRoute
      ? `/creator/${creatorRoute}`
      : `/${location.search}`;
    if (!(next === "home" && location.pathname === nextUrl)) {
      history.pushState({ screen: next }, "", nextUrl);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function toggle(
    value: string,
    values: string[],
    update: (value: string[]) => void,
  ) {
    update(
      values.includes(value)
        ? values.filter((x) => x !== value)
        : [...values, value],
    );
  }
  async function submitCanMake(goalText = goal) {
    if (
      /\bplan\b.*\b(week|days|dinners|lunch(?:es|boxes)?)\b/i.test(goalText)
    ) {
      setMealType(/lunch|tiffin/i.test(goalText) ? "lunch" : "dinner");
      navigate("plan");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api<GroundedAnswer & { gate?: { paywallContext: string } }>("/can-make", "POST", {
        goal: goalText,
        ingredients,
        equipment,
        diet,
        familySize,
        maxMinutes,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function persistMealPlan(next: MealPlanEntry[]) {
    setMealPlanEntries(next);
    localStorage.setItem(`cap-meal-plan-${slug}`, JSON.stringify(next));
  }
  function addItemToMealPlan(item: ContentItem) {
    const entry: MealPlanEntry = {
      id: `${item.id}-${mealDay}-${mealSlot}-${Date.now()}`,
      day: mealDay,
      mealType: mealSlot,
      content: item,
    };
    persistMealPlan(
      [...mealPlanEntries, entry].sort(
        (a, b) => a.day - b.day || a.mealType.localeCompare(b.mealType),
      ),
    );
    setMealPlanMessage(`${item.title} added to Day ${mealDay} ${mealSlot}.`);
    navigate("plan");
  }
  function addSelectedToMealPlan() {
    if (selected) addItemToMealPlan(selected);
  }
  function addCatalogRecipeToMealPlan() {
    const item = catalogRecipes.find((recipe) => recipe.id === catalogRecipeId);
    if (!item) {
      setError(language === "hi" ? "पहले कैटलॉग से व्यंजन चुनें।" : "Choose a catalog recipe first.");
      return;
    }
    addItemToMealPlan(item);
    setCatalogRecipeId("");
  }
  function removeMealPlanEntry(id: string) {
    persistMealPlan(mealPlanEntries.filter((entry) => entry.id !== id));
  }
  function updateIngredient(id: string, patch: Partial<EditableIngredient>) {
    if (!selected) return;
    const next = ingredientDrafts.map((ingredient) =>
      ingredient.id === id ? { ...ingredient, ...patch } : ingredient,
    );
    setIngredientDrafts(next);
    localStorage.setItem(
      `cap-ingredients-${slug}-${selected.id}`,
      JSON.stringify(next),
    );
  }
  function addIngredient() {
    if (!selected) return;
    const next = [
      ...ingredientDrafts,
      {
        id: `custom-${Date.now()}`,
        name: "New ingredient",
        quantity: "",
        unit: "as needed",
        checked: false,
      },
    ];
    setIngredientDrafts(next);
    localStorage.setItem(
      `cap-ingredients-${slug}-${selected.id}`,
      JSON.stringify(next),
    );
  }
  function removeIngredient(id: string) {
    if (!selected) return;
    const next = ingredientDrafts.filter((ingredient) => ingredient.id !== id);
    setIngredientDrafts(next);
    localStorage.setItem(
      `cap-ingredients-${slug}-${selected.id}`,
      JSON.stringify(next),
    );
  }
  async function createPlan() {
    setBusy(true);
    setError("");
    setPlan(null);
    setShopping(null);
    try {
      const created = await api<Plan>("/plan", "POST", {
        days,
        mealType,
        familySize,
        diet,
        equipment,
        excludedIngredients: dislikedIngredients
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        maxMinutes,
      });
      setPlan(created);
      localStorage.setItem(`cap-plan-${slug}`, created.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function createShopping() {
    if (!plan) return;
    setBusy(true);
    setError("");
    try {
      const created = await api<Shopping>("/shopping-list", "POST", {
        planId: plan.id,
      });
      setShopping(
        created.id
          ? await api<Shopping>(`/shopping-list/${created.id}`)
          : created,
      );
      navigate("grocery");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function addSourceToShopping(item: ContentItem) {
    if (!ingredientDrafts.length) {
      setError(
        "This source has no ingredient list to add yet. Open the original recipe for details.",
      );
      return;
    }
    const selectedIngredients = ingredientDrafts.filter(
      (ingredient) => ingredient.checked && ingredient.name.trim(),
    );
    if (!selectedIngredients.length) {
      setError("Select at least one ingredient before adding it to your grocery list.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setShopping({
        id: "local",
        type: "selected-ingredients",
        items: selectedIngredients.map((ingredient, index) => ({
          id: `${item.id}-${ingredient.id}-${index}`,
          ingredient: ingredient.name.trim(),
          quantity: Number(ingredient.quantity.replace(/[^0-9.]/g, "")) || 0,
          unit: ingredient.quantity.trim()
            ? ingredient.unit.trim() || "as needed"
            : "as needed",
          category: "other",
          checked: 0,
        })),
      });
      navigate("grocery");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function savePreferences() {
    setBusy(true);
    setError("");
    try {
      await api("/preferences", "PUT", {
        familySize,
        diet,
        equipment,
        spicePreference,
        dislikedIngredients: dislikedIngredients
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        childAgeRanges: childAgeRanges
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
      });
      setError("Kitchen preferences saved.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function clearPreferences() {
    setBusy(true);
    setError("");
    try {
      await api("/preferences", "DELETE");
      setFamilySize(2);
      setDiet([]);
      setEquipment([]);
      setSpicePreference("medium");
      setDislikedIngredients("");
      setChildAgeRanges("");
      setError("Kitchen preferences cleared.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleSaved(item: ContentItem) {
    setBusy(true);
    setError("");
    setSavedGate("");
    try {
      if (savedItems.some((saved) => saved.id === item.id)) {
        await api(`/saved/${encodeURIComponent(item.id)}`, "DELETE");
      } else {
        const result = await api<{ type?: string; paywallContext?: string }>(
          "/saved",
          "POST",
          { contentId: item.id },
        );
        if (result.type === "FEATURE_GATE") {
          setSavedGate(result.paywallContext || "Your favourites are full.");
          return;
        }
      }
      const saved = await api<{ items: ContentItem[]; limit: number | null }>(
        "/saved",
      );
      setSavedItems(saved.items);
      setSavedLimit(saved.limit);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function replaceMeal(day: number) {
    if (!plan) return;
    setBusy(true);
    setError("");
    const current = plan.items.find((item) => item.day === day);
    const fallback = content.find(
      (item) =>
        item.id !== current?.content.id &&
        item.meta.ingredients.length > 0 &&
        (plan.mealType === "lunch" ? item.meta.mealType === "lunch" : isDinnerCandidate(item)),
    );
    try {
      const replacement = await api<Plan["items"][number]>(
        `/plan/${encodeURIComponent(plan.id)}/replace`,
        "POST",
        { day },
      );
      setPlan({
        ...plan,
        items: plan.items.map((item) =>
          item.day === day ? replacement : item,
        ),
      });
    } catch (e) {
      if (fallback) {
        setPlan({
          ...plan,
          items: plan.items.map((item) =>
            item.day === day
              ? { day, servings: item.servings, content: fallback }
              : item,
          ),
        });
      } else {
        setError(`We couldn't replace that meal right now. ${(e as Error).message}`);
      }
    } finally {
      setBusy(false);
    }
  }
  async function toggleShoppingItem(
    item: NonNullable<Shopping["items"]>[number],
  ) {
    if (!shopping?.id) return;
    if (shopping.id === "local") {
      setShopping({
        ...shopping,
        items: shopping.items?.map((entry) =>
          entry.id === item.id
            ? { ...entry, checked: Number(!item.checked) }
            : entry,
        ),
      });
      return;
    }
    try {
      await api(`/shopping-list/${shopping.id}/${item.id}`, "PATCH", {
        checked: !item.checked,
      });
      setShopping({
        ...shopping,
        items: shopping.items?.map((entry) =>
          entry.id === item.id
            ? { ...entry, checked: Number(!item.checked) }
            : entry,
        ),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function startVoice() {
    const speechWindow = window as SpeechWindow;
    const Speech =
      speechWindow.SpeechRecognition || speechWindow.webkitSpeechRecognition;
    if (!Speech) {
      setError(
        "Voice input is unavailable in this browser. You can type your request instead.",
      );
      return;
    }
    try {
      const gate = await api<{ allowed: boolean; paywallContext?: string }>(
        "/voice/authorize",
        "POST",
        {},
      );
      if (!gate.allowed) {
        setError(
          gate.paywallContext || "Voice trial used. Continue by typing.",
        );
        return;
      }
      const recognition = new Speech();
      recognition.lang = "en-US";
      const voiceStarted = Date.now();
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript || "";
        setGoal(transcript);
        navigate("can-make");
        api("/voice/complete", "POST", {
          durationSeconds: Math.min(
            300,
            Math.ceil((Date.now() - voiceStarted) / 1000),
          ),
        }).catch(() => undefined);
        if (transcript) submitCanMake(transcript);
      };
      recognition.onerror = () =>
        setError("Voice input stopped. You can type your request.");
      recognition.start();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const shoppingItems =
    shopping?.items ||
    shopping?.previewData?.items.map((item, index) => ({
      id: `preview-${index}`,
      ingredient: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      checked: 0,
    }));
  function shareGroceryList() {
    if (!shoppingItems?.length) {
      setError(labels.noGroceryItems);
      return;
    }
    const text = [
      labels.grocery,
      ...shoppingItems.map((item) => {
        const amount = item.quantity
          ? String(item.quantity) + " " + localizedUnit(item.unit, language)
          : localizedUnit(item.unit, language);
        return "• " + localizedIngredient(item.ingredient, language) + " — " + amount;
      }),
    ].join("\n");
    window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank", "noopener,noreferrer");
  }
  const labels = language === "hi"
    ? {
        favourites: "पसंदीदा",
        nutrition: "पोषण तथ्य",
        nutritionDescription: "रेसिपी की कैलोरी और मैक्रो देखें",
        chooseRecipe: "रेसिपी चुनें",
        myKitchen: "मेरी रसोई",
        myPlan: "मेरी योजना",
        useWhat: "मेरे पास जो है",
        speak: "बोलकर बताएं",
        canMake: "क्या मैं इसे बना सकता हूँ?",
        planWeek: "सप्ताह की योजना",
        favouriteIdeas: "पसंदीदा व्यंजन",
        explore: "व्यंजन देखें",
        ideasNow: "अभी के विचार",
        ideasWord: "विचार।",
        search: "सामग्री, भोजन या मूड खोजें",
        grocery: "किराना सूची",
        groceryShare: "WhatsApp पर साझा करें",
        addFromCatalog: "कैटलॉग से व्यंजन जोड़ें",
        chooseCatalogRecipe: "कैटलॉग से व्यंजन चुनें",
        noGroceryItems: "अभी कोई किराना सूची नहीं है।",
        listWord: "सूची।",
        checkIngredients: "सामग्री और उपकरण जांचें",
        easyDinners: "स्रोत-आधारित आसान डिनर",
        addToMealPlan: "भोजन योजना में जोड़ें",
        chooseMealDay: "भोजन और दिन चुनें",
        meal: "भोजन",
        day: "दिन",
        breakfast: "नाश्ता",
        lunch: "दोपहर का भोजन",
        snack: "स्नैक",
        dinner: "रात का खाना",
        addToPlan: "योजना में जोड़ें",
        minutes: "मिनट",
        servings: "सर्विंग",
        noSpecialEquipment: "कोई खास उपकरण नहीं",
        timeNotVerified: "समय सत्यापित नहीं",
        openOriginal: "मूल स्रोत खोलें",
        scaledFor: "लोगों के लिए मात्रा।",
        checkOriginal: "पूरी विधि और भोजन सुरक्षा के लिए मूल वीडियो देखें।",
        ingredientMentions: "सामग्री का उल्लेख",
        sourceDetails: "स्रोत विवरण",
        ingredientsFor: "लोगों के लिए सामग्री",
        chefMentions: "इन सामग्रियों का उल्लेख शेफ ने किया है, लेकिन मात्रा नहीं दी गई। इन्हें स्वादानुसार या जरूरत के मुताबिक जोड़ें।",
        noIngredientList: "इस वीडियो के सार्वजनिक YouTube विवरण में सामग्री सूची नहीं है। पूरी जानकारी के लिए मूल वीडियो खोलें।",
        addIngredient: "+ सामग्री जोड़ें",
        quantity: "मात्रा",
        unit: "इकाई",
        removeIngredient: "सामग्री हटाएं",
        backHome: "← होम",
        allIdeas: "← सभी व्यंजन",
        shopWithPlan: "योजना के साथ खरीदारी",
        canMakeEyebrow: "चलो पता करते हैं",
        canMakeTitle: "क्या मैं यह बना सकता हूँ?",
        canMakeDescription: "अपनी रसोई में मौजूद चीजें बताएं। हम पहले स्रोत सूची जांचेंगे।",
        cookingGoal: "आप क्या बनाना चाहते हैं?",
        ingredientsYouHave: "आपके पास मौजूद सामग्री",
        familySize: "कितने लोगों के लिए",
        availableTime: "उपलब्ध समय (मिनट)",
        kitchenNeeds: "रसोई और खान-पान की जरूरतें",
        findWorks: "क्या बनाया जा सकता है",
        checkingSources: "स्रोत जांच रहे हैं…",
        closestMatch: "आपके लिए सबसे करीबी विकल्प",
        sourceCards: "स्रोत व्यंजन",
        exploreMatches: "मिलते-जुलते व्यंजन देखें",
        youHave: "आपके पास है:",
        stillNeeded: "अभी चाहिए:",
        noCloseMatch: "करीबी विकल्प नहीं मिला",
        browseIdeas: "सभी व्यंजन देखें →",
        editFavourites: "पसंदीदा संपादित करें",
        done: "हो गया",
        remove: "पसंदीदा से हटाएं",
        addFavourite: "♡ पसंद में जोड़ें",
        inFavourites: "♥ पसंद में है · हटाएं",
      }
    : {
        favourites: "Favourites",
        nutrition: "Nutrition",
        nutritionDescription: "View calories and macros for a recipe",
        chooseRecipe: "Choose a recipe",
        myKitchen: "My kitchen",
        myPlan: "My plan",
        useWhat: "Use what I have",
        speak: "Speak instead",
        canMake: "Can I make this?",
        planWeek: "Plan my week",
        favouriteIdeas: "Favourite recipes",
        explore: "Explore",
        ideasNow: "Ideas for right now",
        ideasWord: "ideas.",
        search: "Search ingredients, meals, or moods",
        grocery: "Grocery list",
        groceryShare: "Share on WhatsApp",
        addFromCatalog: "ADD FROM CATALOG",
        chooseCatalogRecipe: "Choose a recipe from the catalog",
        noGroceryItems: "Your grocery list is empty.",
        listWord: "list.",
        checkIngredients: "Check ingredients & equipment",
        easyDinners: "Easy, source-based dinners",
        addToMealPlan: "ADD TO MEAL PLAN",
        chooseMealDay: "Choose a meal and day",
        meal: "Meal",
        day: "Day",
        breakfast: "Breakfast",
        lunch: "Lunch",
        snack: "Snack",
        dinner: "Dinner",
        addToPlan: "Add to plan",
        minutes: "minutes",
        servings: "servings",
        noSpecialEquipment: "No special equipment",
        timeNotVerified: "Time not verified",
        openOriginal: "Open original source",
        scaledFor: "Quantities are scaled for",
        checkOriginal: "Check the original video for full instructions and food safety.",
        ingredientMentions: "Ingredient mentions",
        sourceDetails: "Source details",
        ingredientsFor: "Ingredients for",
        chefMentions: "These ingredients were mentioned by the chef without exact quantities. Add them to taste or as needed, and check the original video for the complete list.",
        noIngredientList: "This video does not publish an ingredient list in its public YouTube metadata. Open the original content for details.",
        addIngredient: "+ Add ingredient",
        quantity: "Qty",
        unit: "Unit",
        removeIngredient: "Remove ingredient",
        backHome: "← Home",
        allIdeas: "← All ideas",
        shopWithPlan: "SHOP WITH A PLAN",
        canMakeEyebrow: "LET'S FIGURE IT OUT",
        canMakeTitle: "Can I make this?",
        canMakeDescription: "Tell us what is in your kitchen. We will check the source catalog first.",
        cookingGoal: "What are you hoping to cook?",
        ingredientsYouHave: "Ingredients you have",
        familySize: "Family size",
        availableTime: "Time available (minutes)",
        kitchenNeeds: "Kitchen & dietary needs",
        findWorks: "Find what works",
        checkingSources: "Checking sources…",
        closestMatch: "Here is your closest match",
        sourceCards: "SOURCE CARDS",
        exploreMatches: "Explore the matches",
        youHave: "You have:",
        stillNeeded: "Still needed:",
        noCloseMatch: "No close match yet",
        browseIdeas: "Browse all ideas →",
        editFavourites: "Edit favourites",
        done: "Done",
        remove: "Remove from favourites",
        addFavourite: "♡ Add to favourites",
        inFavourites: "♥ In favourites · remove",
      };
  function changeLanguage(next: Language) {
    setLanguage(next);
    localStorage.setItem(`cap-language-${slug}`, next);
  }
  function generateNutritionPreview() {
    const parsed = parseNutritionIngredients(nutritionIngredientText);
    if (!parsed.length) {
      setError(language === "hi" ? "पहले सामग्री की सूची डालें।" : "Enter at least one ingredient line first.");
      return;
    }
    setCustomNutritionMeta({
      minutes: 20,
      prepMinutes: 20,
      equipment: [],
      diet: [],
      servings: Math.max(1, Math.min(50, nutritionServings)),
      ingredients: parsed,
    });
  }
  function addPantryIngredient() {
    const value = canonicalIngredient(pantrySearch.trim(), language);
    if (!value) return;
    if (!pantryIngredients.some((ingredient) => ingredient.toLowerCase() === value.toLowerCase()))
      setPantryIngredients((current) => [...current, value]);
    setPantrySearch("");
  }
  const knownPantryIngredients = new Set(
    PANTRY_INGREDIENT_GROUPS.flatMap((group) => group.ingredients.map((name) => name.toLowerCase())),
  );
  const additionalPantryIngredients = [...new Set([
    ...availablePantryIngredients,
    ...pantryIngredients,
  ].filter((name) => !knownPantryIngredients.has(name.toLowerCase())))];
  const visiblePantryGroups = [
    ...PANTRY_INGREDIENT_GROUPS.map((group) => ({
      ...group,
      ingredients: [...new Set([
        ...group.ingredients,
        ...availablePantryIngredients.filter((name) => group.ingredients.includes(name.toLowerCase())),
      ])].filter((name) => `${name} ${localizedIngredient(name, language)}`.toLowerCase().includes(pantrySearch.trim().toLowerCase())),
    })),
    ...(additionalPantryIngredients.length ? [{
      id: "other",
      icon: "🧺",
      title: "Other ingredients",
      titleHi: "अन्य सामग्री",
      ingredients: additionalPantryIngredients.filter((name) => `${name} ${localizedIngredient(name, language)}`.toLowerCase().includes(pantrySearch.trim().toLowerCase())),
    }] : []),
  ].filter((group) => group.ingredients.length > 0);
  if (!creator && !error)
    return <main className="loading">Preparing the kitchen…</main>;
  return (
    <div className={`app-shell language-${language}`}>
      <header className="site-header">
        <button
          className="brand"
          type="button"
          onClick={() => navigate("home")}
        >
          <span className="brand-symbol">
            {creatorInitials(creator?.name || "Kitchen Companion")}
          </span>
          <span>
            {creatorDisplayName(creator?.name || "Kitchen Companion")}
            <small>
              {creator?.category === "cooking" ? "COOKING CREATOR" : "CREATOR WORKSPACE"}
            </small>
          </span>
        </button>
        <div className="header-actions">
          <label className="language-picker">
            <span className="sr-only">Language</span>
            <select
              value={language}
              onChange={(event) => changeLanguage(event.target.value as Language)}
              aria-label="Language"
            >
              <option value="en">English</option>
              <option value="hi">Hindi</option>
            </select>
          </label>
          <button
            className="header-link"
            type="button"
            onClick={() => navigate("saved")}
          >
            {labels.favourites}
          </button>
          <button
            className="header-link"
            type="button"
            onClick={() => navigate("preferences")}
          >
            {labels.myKitchen}
          </button>
          <button
            className="header-link"
            type="button"
            onClick={() => navigate("plan")}
          >
            {labels.myPlan} <span>↗</span>
          </button>
          <button
            className="header-link"
            type="button"
            onClick={() => navigate("grocery")}
          >
            {labels.grocery}
          </button>
        </div>
      </header>
      {screen === "home" && (
        <main>
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">{creatorDisplayName(creator?.name || "Your cooking workspace")}</p>
              <h1 className={creatorDisplayName(creator?.name || "Kitchen Companion").split(/\s+/).some((word) => word.length > 14) ? "hero-title-long" : undefined}>
                {creatorKitchenHero(creator?.name || "Kitchen Companion")}
              </h1>
              <p>
                Simple recipes, everyday ideas, and a little help deciding what
                to cook.
              </p>
              <div className="hero-actions">
                <button
                  className="primary"
                  onClick={() => navigate("can-make")}
                >
                  {labels.useWhat} <span>→</span>
                </button>
                <button
                  className="secondary"
                  onClick={startVoice}
                  title="Speak your request"
                >
                  🎙 {labels.speak}
                </button>
              </div>
            </div>
            <div className="hero-illustration" aria-hidden="true">
              <img
                className="hero-food-image"
                src="/hero-food.png"
                alt=""
                loading="eager"
              />
              <span className="sparkle sparkle-one">✳</span>
              <span className="sparkle sparkle-two">✦</span>
            </div>
          </section>
          <section className="action-grid" aria-label="Cooking actions">
            <button onClick={() => navigate("can-make")}>
              <span>◉</span>
              <strong>{labels.canMake}</strong>
              <small>{labels.checkIngredients}</small>
            </button>
            <button onClick={() => navigate("plan")}>
              <span>▦</span>
              <strong>{labels.planWeek}</strong>
              <small>{labels.easyDinners}</small>
            </button>
            <button onClick={() => navigate("saved")}>
              <span>♡</span>
              <strong>{labels.favouriteIdeas}</strong>
              <small>{language === "hi" ? "अपने पसंदीदा व्यंजन देखें" : "Return to your favourites"}</small>
            </button>
            <button onClick={() => navigate("nutrition")}>
              <span>◒</span>
              <strong>{labels.nutrition}</strong>
              <small>{labels.nutritionDescription}</small>
            </button>
          </section>
          <section className="content-section">
            <div className="section-head">
              <div>
                <p className="eyebrow">{labels.explore}</p>
                <h2>{labels.ideasNow}</h2>
              </div>
              <span className="count">{filtered.length} ideas</span>
            </div>
            <div className="search-wrap">
              <span aria-hidden="true">⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={labels.search}
                aria-label="Search sample recipes"
              />
              {query && (
                <button
                  className="search-clear"
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <div className="chips">
              {[
                "Quick",
                "Healthy",
                "High protein",
                "Kids/tiffin",
                "Vegetarian",
                "No oven",
                "Air fryer",
              ].map((chip) => (
                <button
                  key={chip}
                  className={
                    query.toLowerCase() === chip.toLowerCase() ? "active" : ""
                  }
                  onClick={() =>
                    setQuery(
                      query.toLowerCase() === chip.toLowerCase() ? "" : chip,
                    )
                  }
                >
                  {localizedChip(chip, language)}
                </button>
              ))}
            </div>
            <div className="recipe-grid">
              {filtered.map((item) => (
                <RecipeCard
                  key={item.id}
                  item={item}
                  language={language}
                  onOpen={() => open(item)}
                />
              ))}
            </div>
            {!filtered.length && (
              <div className="creator-empty">
                <strong>
                  {query
                    ? "No ideas match that search yet."
                    : "This creator page is ready for its first approved content."}
                </strong>
                <p>
                  Add reviewed source metadata in the operator workspace, then
                  visitors can search it, ask Can I Make This, and build plans.
                </p>
                <a href="/admin">Open creator workspace ↗</a>
              </div>
            )}
          </section>
        </main>
      )}
      {screen === "can-make" && (
        <main className="inner pantry-page">
          <button className="back" onClick={() => navigate("home")}>
            {labels.backHome}
          </button>
          <div className="page-title">
            <p className="eyebrow">{language === "hi" ? "आज क्या पकाएं" : "LET’S FIGURE IT OUT"}</p>
            <h1>{language === "hi" ? "मेरी पेंट्री से मैं क्या बना सकता हूँ?" : "What can I make using my pantry?"}</h1>
            <p>{language === "hi" ? "अपनी सामग्री चुनें। हम पहले रेसिपी कैटलॉग में मिलते-जुलते व्यंजन खोजेंगे।" : "Select ingredients you have. We’ll find the closest matches in this recipe catalog first."}</p>
          </div>
          <div className="pantry-layout">
            <section className="pantry-panel" aria-labelledby="pantry-ingredients-title">
              <div className="pantry-panel-heading">
                <div>
                  <p className="eyebrow">{language === "hi" ? "आपके पास क्या है" : "YOUR INGREDIENTS"}</p>
                  <h2 id="pantry-ingredients-title">{language === "hi" ? "मेरी पेंट्री" : "My pantry"}</h2>
                </div>
                <span className="pantry-count">{pantryIngredients.length}</span>
              </div>
              {pantryIngredients.length > 0 && (
                <div className="pantry-selected" aria-label={language === "hi" ? "चुनी गई सामग्री" : "Selected ingredients"}>
                  {pantryIngredients.map((ingredient) => (
                    <button key={ingredient} type="button" aria-pressed="true" onClick={() => setPantryIngredients((current) => current.filter((value) => value !== ingredient))}>
                      {localizedIngredient(ingredient, language)} <span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="pantry-add-row">
                <input
                  value={pantrySearch}
                  onChange={(event) => setPantrySearch(event.target.value)}
                  onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addPantryIngredient(); } }}
                  placeholder={language === "hi" ? "सामग्री खोजें या जोड़ें" : "Find or add an ingredient"}
                  aria-label={language === "hi" ? "सामग्री खोजें या जोड़ें" : "Find or add an ingredient"}
                />
                <button type="button" onClick={addPantryIngredient} aria-label={language === "hi" ? "सामग्री जोड़ें" : "Add ingredient"}>+</button>
              </div>
              <p className="pantry-help">{language === "hi" ? "नीचे से सामग्री चुनें या अपनी सामग्री जोड़ें।" : "Choose ingredients from the catalog, or add your own."}</p>
              <div className="pantry-ingredient-groups">
                {visiblePantryGroups.map((group) => {
                  const selectedCount = group.ingredients.filter((ingredient) => pantryIngredients.includes(ingredient)).length;
                  return (
                    <details className="pantry-ingredient-group" key={group.id} open={pantrySearch.trim() ? true : group.id === "vegetables"}>
                      <summary>
                        <span className="pantry-group-icon" aria-hidden="true">{group.icon}</span>
                        <span className="pantry-group-label">
                          <strong>{language === "hi" ? group.titleHi : group.title}</strong>
                          <small>{selectedCount}/{group.ingredients.length} {language === "hi" ? "सामग्री" : "ingredients"}</small>
                        </span>
                        <span className="pantry-group-chevron" aria-hidden="true">⌄</span>
                      </summary>
                      <div className="pantry-ingredient-list">
                        {group.ingredients.map((ingredient) => {
                          const active = pantryIngredients.includes(ingredient);
                          return (
                            <button key={ingredient} type="button" className={active ? "active" : ""} aria-pressed={active} onClick={() => setPantryIngredients((current) => active ? current.filter((value) => value !== ingredient) : [...current, ingredient])}>
                              {localizedIngredient(ingredient, language)}
                            </button>
                          );
                        })}
                      </div>
                    </details>
                  );
                })}
                {!visiblePantryGroups.length && pantrySearch.trim() && (
                  <p className="pantry-no-ingredient">{language === "hi" ? "Enter या + दबाकर अपनी सामग्री जोड़ें।" : "Press Enter or + to add your ingredient."}</p>
                )}
              </div>
            </section>
            <section className="pantry-results" aria-labelledby="pantry-results-title">
              <div className="pantry-results-heading">
                <div>
                  <p className="eyebrow">{language === "hi" ? "कैटलॉग से मेल" : "FROM YOUR RECIPE CATALOG"}</p>
                  <h2 id="pantry-results-title">{language === "hi" ? "आप क्या बना सकते हैं" : "Recipes you can make"}</h2>
                </div>
                <span className="count">{pantryMatches.length} {language === "hi" ? "रेसिपी" : "recipes"}</span>
              </div>
              <p className="pantry-results-help">
                {pantryIngredients.length
                  ? (language === "hi" ? `आपके ${pantryIngredients.length} चुने हुए सामग्री से सबसे अच्छे मेल पहले दिखाए गए हैं।` : `Closest matches for your ${pantryIngredients.length} selected ingredient${pantryIngredients.length === 1 ? "" : "s"} appear first.`)
                  : (language === "hi" ? "रेसिपी मिलान देखने के लिए बाईं ओर सामग्री चुनें।" : "Select ingredients on the left to rank recipes by how well they match.")}
              </p>
              {!pantryIngredients.length ? (
                <div className="creator-empty" role="status">
                  <strong>{language === "hi" ? "अपनी सामग्री चुनें" : "Choose ingredients to get started"}</strong>
                  <p>{language === "hi" ? "बाईं ओर पेंट्री से एक या अधिक सामग्री चुनें।" : "Select one or more ingredients from your pantry on the left to see recipe matches."}</p>
                </div>
              ) : pantryMatches.length ? (
                <div className="pantry-match-list">
                  {pantryMatches.map((match) => (
                    <article className="pantry-match" key={match.item.id}>
                      <RecipeCard item={match.item} language={language} onOpen={() => open(match.item)} />
                      {pantryIngredients.length > 0 && (
                        <p className="pantry-match-details">
                          <strong>{language === "hi" ? "आपके पास है:" : "You have:"}</strong> {match.has.map((name) => localizedIngredient(name, language)).join(", ")}
                          {match.missing.length > 0 && <><span> · </span><strong>{language === "hi" ? "अभी चाहिए:" : "Still needed:"}</strong> {match.missing.slice(0, 4).map((name) => localizedIngredient(name, language)).join(", ")}{match.missing.length > 4 ? ` +${match.missing.length - 4}` : ""}</>}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="creator-empty" role="status">
                  <strong>{language === "hi" ? "इन सामग्री से कोई मेल नहीं मिला।" : "No recipes match those ingredients yet."}</strong>
                  <p>{language === "hi" ? "कुछ सामग्री हटाएं या कोई दूसरी सामग्री चुनें।" : "Remove an ingredient or choose another one to see more matches."}</p>
                </div>
              )}
              {catalogRecipes.length > 0 && (
                <section className="pantry-nutrition-selector">
                  <p className="eyebrow">{language === "hi" ? "प्रति सर्विंग पोषण" : "NUTRITION PER SERVING"}</p>
                  <label className="nutrition-recipe-picker">
                    {language === "hi" ? "पोषण देखने के लिए रेसिपी चुनें" : "Choose a recipe to see its nutrition"}
                    <select
                      value={nutritionRecipeId || catalogRecipes[0]!.id}
                      onChange={(event) => setNutritionRecipeId(event.target.value)}
                    >
                      {catalogRecipes.map((recipe) => (
                        <option key={recipe.id} value={recipe.id}>{recipe.title}</option>
                      ))}
                    </select>
                  </label>
                  {(() => {
                    const recipe = catalogRecipes.find((item) => item.id === nutritionRecipeId) || catalogRecipes[0]!;
                    return <RecipeOverview meta={recipe.meta} language={language} />;
                  })()}
                </section>
              )}
            </section>
          </div>
        </main>
      )}
      {screen === "nutrition" && (
        <main className="inner nutrition-page">
          <button className="back" onClick={() => navigate("home")}>
            {labels.backHome}
          </button>
          <div className="page-title">
            <p className="eyebrow">{labels.nutrition}</p>
            <h1>{language === "hi" ? "अपनी रेसिपी जानें।" : "Know what’s on your plate."}</h1>
            <p>{language === "hi" ? "कैटलॉग से रेसिपी चुनें। पोषण मान सूचीबद्ध सामग्री और सर्विंग के आधार पर अनुमान हैं।" : "Choose a recipe from the catalog. Nutrition values are estimates based on listed ingredients and servings."}</p>
          </div>
          {catalogRecipes.length ? (
            <>
              <label className="nutrition-recipe-picker">
                {labels.chooseRecipe}
                <select
                  value={nutritionRecipeId || catalogRecipes[0]!.id}
                  onChange={(event) => setNutritionRecipeId(event.target.value)}
                >
                  {catalogRecipes.map((recipe) => (
                    <option key={recipe.id} value={recipe.id}>{recipe.title}</option>
                  ))}
                </select>
              </label>
              {(() => {
                const recipe = catalogRecipes.find((item) => item.id === nutritionRecipeId) || catalogRecipes[0]!;
                return (
                  <section className="nutrition-result">
                    <h2>{recipe.title}</h2>
                    <RecipeOverview meta={recipe.meta} language={language} />
                    <button className="secondary" onClick={() => open(recipe)}>
                      {language === "hi" ? "पूरी रेसिपी खोलें" : "Open recipe"} →
                    </button>
                  </section>
                );
              })()}
            </>
          ) : (
            <div className="creator-empty" role="status">
              <strong>{language === "hi" ? "अभी कोई सामग्री वाली रेसिपी नहीं है।" : "No recipes with ingredient lists yet."}</strong>
              <p>{language === "hi" ? "पोषण अनुमान देखने के लिए सामग्री वाली रेसिपी जोड़ें।" : "Add a recipe with ingredient quantities to see a nutrition estimate."}</p>
            </div>
          )}
          <section className="nutrition-calculator">
            <p className="eyebrow">{language === "hi" ? "अपना अनुमान बनाएं" : "MAKE A QUICK ESTIMATE"}</p>
            <h2>{language === "hi" ? "सामग्री डालें" : "Estimate a recipe"}</h2>
            <p className="nutrition-intro">{language === "hi" ? "सामग्री की मात्रा प्रति पंक्ति लिखें। यह केवल एक असहेजा हुआ अनुमान बनाएगा।" : "Enter ingredient amounts one per line. This creates an unsaved estimate only."}</p>
            <label>
              {language === "hi" ? "रेसिपी का नाम" : "Recipe name"}
              <input value={nutritionName} onChange={(event) => setNutritionName(event.target.value)} placeholder={language === "hi" ? "झींगा टैको" : "Shrimp tacos"} />
            </label>
            <label>
              {language === "hi" ? "सर्विंग" : "Servings"}
              <input type="number" min={1} max={50} value={nutritionServings} onChange={(event) => setNutritionServings(Number(event.target.value) || 1)} />
            </label>
            <label>
              {language === "hi" ? "सामग्री, हर पंक्ति में एक" : "Ingredients, one per line"}
              <textarea rows={8} value={nutritionIngredientText} onChange={(event) => { setNutritionIngredientText(event.target.value); setCustomNutritionMeta(null); }} placeholder={"200 g shrimp\n4 corn tortillas\n1/2 avocado\n1 lime\n1 tbsp olive oil"} />
            </label>
            <button className="primary" type="button" onClick={generateNutritionPreview}>
              {language === "hi" ? "पोषण अनुमान बनाएं" : "Generate nutrition estimate"} <span>→</span>
            </button>
            {customNutritionMeta && (
              <div className="nutrition-custom-preview" aria-live="polite">
                <h3>{nutritionName.trim() || (language === "hi" ? "रेसिपी अनुमान" : "Recipe estimate")}</h3>
                <RecipeOverview meta={customNutritionMeta} language={language} />
              </div>
            )}
          </section>
        </main>
      )}
      {screen === "plan" && (
        <main className="inner">
          <button className="back" onClick={() => navigate("home")}>
            ← Home
          </button>
          <div className="page-title">
            <p className="eyebrow">MAKE THE WEEK EASIER</p>
            <h1>
              Plan a little <i>ahead.</i>
            </h1>
            <p>
              Start with source-based meal ideas, then shape the whole week
              around your household.
            </p>
          </div>
          <div className="form-card compact">
            <div className="form-row">
              <label>
                Plan for
                <select
                  value={mealType}
                  onChange={(e) =>
                    setMealType(e.target.value as "dinner" | "lunch")
                  }
                >
                  <option value="dinner">Dinners</option>
                  <option value="lunch">Lunchboxes</option>
                </select>
              </label>
              <label>
                Days to plan
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                >
                  {[2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n} days
                    </option>
                  ))}
                </select>
              </label>
              <label>
                People eating
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={familySize}
                  onChange={(e) => setFamilySize(Number(e.target.value))}
                />
              </label>
              <label>
                Time per meal (minutes)
                <input
                  type="number"
                  min="1"
                  max="240"
                  value={maxMinutes}
                  onChange={(e) => setMaxMinutes(Number(e.target.value))}
                />
              </label>
            </div>
            <p className="field-label">Preferences</p>
            <div className="chips">
              {["vegetarian", "high-protein"].map((x) => (
                <button
                  key={x}
                  className={diet.includes(x) ? "active" : ""}
                  onClick={() => toggle(x, diet, setDiet)}
                >
                  {x}
                </button>
              ))}
            </div>
            <button
              className="primary full"
              disabled={busy}
              onClick={createPlan}
            >
              {busy ? "Making your plan…" : `Create my ${mealType} plan`}{" "}
              <span>→</span>
            </button>
          </div>
          <section className="meal-plan-add catalog-plan-section">
            <div>
              <p className="eyebrow">{labels.addFromCatalog}</p>
              <strong>{labels.chooseCatalogRecipe}</strong>
            </div>
            <div className="meal-plan-fields">
              <label>
                {labels.chooseCatalogRecipe}
                <select
                  value={catalogRecipeId}
                  onChange={(event) => setCatalogRecipeId(event.target.value)}
                >
                  <option value="">—</option>
                  {catalogRecipes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {labels.meal}
                <select
                  value={mealSlot}
                  onChange={(event) => setMealSlot(event.target.value as MealSlot)}
                >
                  <option value="breakfast">{labels.breakfast}</option>
                  <option value="lunch">{labels.lunch}</option>
                  <option value="snack">{labels.snack}</option>
                  <option value="dinner">{labels.dinner}</option>
                </select>
              </label>
              <label>
                {labels.day}
                <select
                  value={mealDay}
                  onChange={(event) => setMealDay(Number(event.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                    <option key={day} value={day}>
                      {labels.day} {day}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary" onClick={addCatalogRecipeToMealPlan}>
                {labels.addToPlan} <span>→</span>
              </button>
            </div>
          </section>
          {mealPlanEntries.length > 0 && (
            <section className="result-section manual-plan-section">
              <div className="section-head">
                <div>
                  <p className="eyebrow">YOUR SAVED MEALS</p>
                  <h2>Meals you added</h2>
                </div>
              </div>
              {mealPlanMessage && (
                <p className="plan-confirmation" role="status">
                  {mealPlanMessage}
                </p>
              )}
              <div className="plan-list">
                {mealPlanEntries.map((entry) => (
                  <div className="plan-day" key={entry.id}>
                    <span>DAY {entry.day}</span>
                    <strong>{entry.content.title}</strong>
                    <small>{entry.mealType}</small>
                    <button onClick={() => open(entry.content)}>
                      See source ↗
                    </button>
                    <button onClick={() => removeMealPlanEntry(entry.id)}>
                      Remove ×
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
          {plan && (
            <section className="result-section">
              <div className="section-head">
                <div>
                  <p className="eyebrow">YOUR PLAN</p>
                  <h2>{plan.previewDays} days made easier</h2>
                </div>
              </div>
              <div className="plan-list">
                {plan.items.map((item) => (
                  <div className="plan-day" key={item.day}>
                    <span>DAY {item.day}</span>
                    <strong>{item.content.title}</strong>
                    <small>
                      {item.servings} servings · {item.content.meta.minutes} min
                    </small>
                    <button onClick={() => open(item.content)}>
                      See source ↗
                    </button>
                    <button
                      onClick={() => replaceMeal(item.day)}
                      disabled={busy}
                    >
                      Replace meal ↻
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="primary"
                onClick={createShopping}
                disabled={busy}
              >
                Create grocery list <span>→</span>
              </button>
            </section>
          )}
        </main>
      )}
      {screen === "grocery" && (
        <main className="inner">
          <button className="back" onClick={() => navigate("plan")}>
            ← My plan
          </button>
          <div className="page-title">
            <p className="eyebrow">{labels.shopWithPlan}</p>
            <h1>
              {labels.grocery.replace(/\s+(सूची|list)$/, "")} <i>{labels.listWord}</i>
            </h1>
            <button
              className="secondary grocery-share"
              type="button"
              onClick={shareGroceryList}
              disabled={!shoppingItems?.length}
            >
              {labels.groceryShare} ↗
            </button>
          </div>
          {shoppingItems?.length ? (
          <div className="shopping-list">
            {shoppingItems?.map((item) => (
              <label key={item.id} className={item.checked ? "checked" : ""}>
                <input
                  type="checkbox"
                  checked={!!item.checked}
                  onChange={() => toggleShoppingItem(item)}
                  disabled={!shopping?.id}
                />
                <span>{localizedIngredient(item.ingredient, language)}</span>
                <small>
                  {item.quantity
                    ? `${item.quantity} ${localizedUnit(item.unit, language)}`
                    : localizedUnit(item.unit, language)}
                </small>
              </label>
            ))}
          </div>
          ) : (
            <div className="creator-empty">
              <strong>{labels.noGroceryItems}</strong>
              <p>{language === "hi" ? "अपनी योजना से सूची बनाएं या किसी रेसिपी की सामग्री चुनें।" : "Create a list from your plan or select ingredients from a recipe."}</p>
              <button className="secondary" onClick={() => navigate("plan")}>
                {labels.myPlan}
              </button>
            </div>
          )}
        </main>
      )}
      {screen === "saved" && (
        <main className="inner">
          <button className="back" onClick={() => navigate("home")}>
            ← Home
          </button>
          <div className="page-title favourites-heading">
            <p className="eyebrow">YOUR FAVOURITES</p>
            <h1>
              {labels.favourites} <i>{labels.ideasWord}</i>
            </h1>
            <p>
              {savedItems.length} {language === "hi" ? "पसंदीदा" : "favourites"}
              {savedLimit === null ? "" : ` · ${savedLimit} included with Free`}
            </p>
            <button
              className="quiet-action favourites-edit"
              type="button"
              onClick={() => setEditingFavourites((value) => !value)}
            >
              {editingFavourites ? labels.done : labels.editFavourites}
            </button>
          </div>
          {savedItems.length ? (
            <div className="recipe-grid">
              {savedItems.map((item) => (
                <div className="favourite-item" key={item.id}>
                  <RecipeCard item={item} language={language} onOpen={() => open(item)} />
                  {editingFavourites && (
                    <button
                      className="favourite-remove"
                      type="button"
                      onClick={() => toggleSaved(item)}
                      disabled={busy}
                    >
                      {labels.remove}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="empty">
              {language === "hi"
                ? "किसी व्यंजन को खोलकर उसे बाद के लिए पसंदीदा में जोड़ें।"
                : "Open an idea and add it to your favourites for later."}
            </p>
          )}
          {savedGate && (
            <div className="paywall">
              <h3>Keep more ideas close</h3>
              <p>
                {savedGate} Pricing and checkout are not configured in this
                local workspace.
              </p>
            </div>
          )}
        </main>
      )}
      {screen === "preferences" && (
        <main className="inner">
          <button className="back" onClick={() => navigate("home")}>
            ← Home
          </button>
          <div className="page-title">
            <p className="eyebrow">YOUR EVERYDAY BASICS</p>
            <h1>
              My <i>kitchen.</i>
            </h1>
            <p>
              Save adult-owned basics for planning. This demo does not create
              child accounts.
            </p>
          </div>
          <div className="form-card compact">
            <div className="form-row">
              <label>
                People eating
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={familySize}
                  onChange={(e) => setFamilySize(Number(e.target.value))}
                />
              </label>
              <label>
                Spice preference
                <select
                  value={spicePreference}
                  onChange={(e) =>
                    setSpicePreference(
                      e.target.value as "mild" | "medium" | "hot",
                    )
                  }
                >
                  <option value="mild">Mild</option>
                  <option value="medium">Medium</option>
                  <option value="hot">Hot</option>
                </select>
              </label>
            </div>
            <p className="field-label">Diet</p>
            <div className="chips">
              {["vegetarian", "high-protein"].map((value) => (
                <button
                  key={value}
                  className={diet.includes(value) ? "active" : ""}
                  onClick={() => toggle(value, diet, setDiet)}
                >
                  {value}
                </button>
              ))}
            </div>
            <p className="field-label">Equipment limits</p>
            <div className="chips">
              {["no oven", "no air fryer"].map((value) => (
                <button
                  key={value}
                  className={equipment.includes(value) ? "active" : ""}
                  onClick={() => toggle(value, equipment, setEquipment)}
                >
                  {value}
                </button>
              ))}
            </div>
            <label>
              Ingredients to avoid
              <input
                value={dislikedIngredients}
                onChange={(e) => setDislikedIngredients(e.target.value)}
                placeholder="e.g. mushrooms, peanuts"
              />
            </label>
            <label>
              Children’s age ranges (adult-owned)
              <input
                value={childAgeRanges}
                onChange={(e) => setChildAgeRanges(e.target.value)}
                placeholder="e.g. 4–6, 7–10"
              />
            </label>
            <button
              className="primary full"
              onClick={savePreferences}
              disabled={busy}
            >
              Save my kitchen <span>→</span>
            </button>
            <button
              className="quiet-action"
              onClick={clearPreferences}
              disabled={busy}
            >
              Clear saved kitchen preferences
            </button>
          </div>
        </main>
      )}
      {screen === "source" && selected && (
        <main className="inner source-page">
          <button className="back" onClick={() => navigate("home")}>
            {labels.allIdeas}
          </button>
          <div className="source-hero">
            <h1>{selected.title}</h1>
            <div className="source-facts">
              <span>
                ◷ {selected.meta.minutes
                  ? `${selected.meta.minutes} ${labels.minutes}`
                  : labels.timeNotVerified}
              </span>
              <span>♧ {selected.meta.servings} {labels.servings}</span>
              <span>
                ◎ {selected.meta.equipment.length
                  ? selected.meta.equipment
                      .map((equipment) => localizedEquipment(equipment, language))
                      .join(", ")
                  : labels.noSpecialEquipment}
              </span>
            </div>
            <RecipeOverview meta={selected.meta} language={language} />
            <button
              className="secondary save-source"
              disabled={busy}
              onClick={() => toggleSaved(selected)}
            >
              {savedItems.some((item) => item.id === selected.id)
                ? labels.inFavourites
                : labels.addFavourite}
            </button>
            <div className="meal-plan-add">
              <div>
                <p className="eyebrow">{labels.addToMealPlan}</p>
                <strong>{labels.chooseMealDay}</strong>
              </div>
              <div className="meal-plan-fields">
                <label>
                  {labels.meal}
                  <select
                    value={mealSlot}
                    onChange={(event) =>
                      setMealSlot(event.target.value as MealSlot)
                    }
                  >
                    <option value="breakfast">{labels.breakfast}</option>
                    <option value="lunch">{labels.lunch}</option>
                    <option value="snack">{labels.snack}</option>
                    <option value="dinner">{labels.dinner}</option>
                  </select>
                </label>
                <label>
                  {labels.day}
                  <select
                    value={mealDay}
                    onChange={(event) => setMealDay(Number(event.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                      <option key={day} value={day}>
                        {labels.day} {day}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary" onClick={addSelectedToMealPlan}>
                  {labels.addToPlan} <span>→</span>
                </button>
              </div>
            </div>
          </div>
          {savedGate && (
            <div className="paywall">
              <h3>Keep more ideas close</h3>
              <p>
                {savedGate} Pricing and checkout are not configured in this
                local workspace.
              </p>
            </div>
          )}
          <div className="source-columns">
            <section>
              <h2>
                {selected.meta.ingredients.length
                  ? language === "hi"
                    ? `${familySize} ${labels.ingredientsFor}`
                    : `${labels.ingredientsFor} ${familySize}`
                  : selected.meta.ingredientHints?.length
                    ? labels.ingredientMentions
                    : labels.sourceDetails}
              </h2>
              {!!selected.meta.ingredients.length && (
                <p className="source-scale-note">
                  {language === "hi"
                    ? `${familySize} ${labels.scaledFor} ${labels.checkOriginal}`
                    : `${labels.scaledFor} ${familySize}. ${labels.checkOriginal}`}
                </p>
              )}
              {!selected.meta.ingredients.length && selected.meta.ingredientHints?.length ? (
                <p className="source-scale-note">
                  {labels.chefMentions}
                </p>
              ) : null}
              {!selected.meta.ingredients.length && !selected.meta.ingredientHints?.length && (
                <p>
                  {labels.noIngredientList}
                </p>
              )}
              <div className="ingredients-list" role="list">
                {ingredientDrafts.map((ingredient) => (
                  <div className="ingredient-row" role="listitem" key={ingredient.id}>
                    <input
                      type="checkbox"
                      checked={ingredient.checked}
                      onChange={(event) =>
                        updateIngredient(ingredient.id, {
                          checked: event.target.checked,
                        })
                      }
                      aria-label={`${language === "hi" ? "तैयार सामग्री चुनें" : "Mark as ready"}: ${localizedIngredient(ingredient.name, language)}`}
                    />
                    <input
                      className={ingredient.checked ? "ingredient-name checked" : "ingredient-name"}
                      value={localizedIngredient(ingredient.name, language)}
                      lang={language}
                      onChange={(event) =>
                        updateIngredient(ingredient.id, {
                          name: canonicalIngredient(event.target.value, language),
                        })
                      }
                      aria-label={language === "hi" ? "सामग्री का नाम" : "Ingredient name"}
                    />
                    <input
                      className="ingredient-quantity"
                      value={ingredient.quantity}
                      onChange={(event) =>
                        updateIngredient(ingredient.id, {
                          quantity: event.target.value,
                        })
                      }
                      placeholder={labels.quantity}
                      aria-label={`${labels.quantity} ${localizedIngredient(ingredient.name, language)}`}
                    />
                    <input
                      className="ingredient-unit"
                      value={localizedUnit(ingredient.unit, language)}
                      lang={language}
                      onChange={(event) =>
                        updateIngredient(ingredient.id, {
                          unit: canonicalUnit(event.target.value, language),
                        })
                      }
                      placeholder={labels.unit}
                      aria-label={`${labels.unit} ${localizedIngredient(ingredient.name, language)}`}
                    />
                    <button
                      className="ingredient-remove"
                      type="button"
                      onClick={() => removeIngredient(ingredient.id)}
                      aria-label={`${labels.removeIngredient}: ${localizedIngredient(ingredient.name, language)}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button className="quiet-action ingredient-add" onClick={addIngredient}>
                {labels.addIngredient}
              </button>
            </section>
            <aside>
              <a
                href={
                  selected.sourceUrl.startsWith("/")
                    ? `${selected.sourceUrl}?creator=${encodeURIComponent(slug)}`
                    : selected.sourceUrl
                }
                target={
                  selected.sourceUrl.startsWith("https://")
                    ? "_blank"
                    : undefined
                }
                rel={
                  selected.sourceUrl.startsWith("https://")
                    ? "noopener noreferrer"
                    : undefined
                }
                onClick={() => {
                  if (selected.sourceUrl.includes("youtube.com"))
                    api("/event", "POST", {
                      type: "youtube_click",
                      contentId: selected.id,
                    }).catch(() => undefined);
                }}
              >
                {labels.openOriginal} ↗
              </a>
              <button
                className="secondary source-grocery"
                disabled={busy}
                onClick={() => addSourceToShopping(selected)}
              >
                {language === "hi"
                  ? "चुनी हुई सामग्री किराना सूची में जोड़ें"
                  : "Add selected ingredients to grocery list"}
              </button>
            </aside>
          </div>
        </main>
      )}
      {error && (
        <div className="toast" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
      <footer>
        <p>{creator?.brand.disclaimer || "Unofficial product concept."}</p>
        <p>
          Source metadata has provenance · AI suggestions are labelled · No
          affiliation implied by this demo
        </p>
      </footer>
      <nav className="mobile-nav" aria-label="Main navigation">
        <button
          className={screen === "home" ? "active" : ""}
          onClick={() => navigate("home")}
        >
          ⌂<span>Explore</span>
        </button>
        <button
          className={screen === "can-make" ? "active" : ""}
          onClick={() => navigate("can-make")}
        >
          ◉<span>{language === "hi" ? "मेरी पेंट्री" : "Pantry"}</span>
        </button>
        <button
          className={screen === "plan" ? "active" : ""}
          onClick={() => navigate("plan")}
        >
          ▦<span>My plan</span>
        </button>
        <button
          className={screen === "saved" ? "active" : ""}
          onClick={() => navigate("saved")}
        >
          ♡<span>{labels.favourites}</span>
        </button>
        <button
          className={screen === "grocery" ? "active" : ""}
          onClick={() => navigate("grocery")}
        >
          🛒<span>{labels.grocery}</span>
        </button>
      </nav>
    </div>
  );
}
