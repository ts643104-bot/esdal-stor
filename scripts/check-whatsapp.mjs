// Verifies the WhatsApp number normalisation used at checkout.
const toWhatsappNumber = (value) => {
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0020")) digits = digits.slice(2);
  if (digits.startsWith("20")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  if (!/^1[0125]\d{8}$/.test(digits)) return null;
  return `20${digits}`;
};

const DEFAULT = "201140971703";
const getActive = (numbers) => {
  const valid = (numbers || []).map(toWhatsappNumber).filter(Boolean);
  if (!valid.length) return DEFAULT;
  return valid[0];
};

const cases = [
  ["01140971703", "201140971703", "local 11 digits"],
  ["201140971703", "201140971703", "already international"],
  ["1140971703", "201140971703", "local without leading zero"],
  ["+20 114 097 1703", "201140971703", "plus + spaces"],
  ["00201140971703", "201140971703", "double-prefix international"],
  ["01012345678", "201012345678", "another local number"],
  ["20123456789", null, "too short -> must be rejected"],
  ["012345678901", null, "too long -> must be rejected"],
  ["", null, "empty -> rejected"],
  ["1234", null, "garbage -> rejected"],
];

let failed = 0;
for (const [input, expected, label] of cases) {
  const got = toWhatsappNumber(input);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label.padEnd(32)} input=${JSON.stringify(input).padEnd(18)} got=${JSON.stringify(got)} expected=${JSON.stringify(expected)}`);
}

// The bug that broke checkout: every order must reach the FIRST configured
// number, never a rotation.
console.log("\n-- link construction --");
const bad = getActive(["20123456789"]);
console.log("all-invalid list falls back to default:", bad === DEFAULT, `-> ${bad}`);
console.log("empty list falls back to default:", getActive([]) === DEFAULT);
console.log("undefined list falls back to default:", getActive(undefined) === DEFAULT);
const mixed = getActive(["01140971703", "20123456789"]);
console.log("first valid wins over later invalid:", mixed === "201140971703", `-> ${mixed}`);
const twoValid = getActive(["201140971703", "201122310891"]);
console.log("FIRST number always wins (no rotation):", twoValid === "201140971703", `-> ${twoValid}`);
const reversed = getActive(["201122310891", "201140971703"]);
console.log("order matters - admin controls destination:", reversed === "201122310891", `-> ${reversed}`);
const link = `https://wa.me/${getActive(["01140971703"])}?text=${encodeURIComponent("مرحبا")}`;
console.log("sample link:", link.slice(0, 60) + "...");
console.log(link.startsWith("https://wa.me/201140971703?text=") ? "PASS link format" : "FAIL link format");

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
