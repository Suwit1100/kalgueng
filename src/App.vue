<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { AiEstimateError, estimateNutritionWithAI } from './lib/ai'
import { loadGoogleIdentity, signInWithGoogle } from './lib/google'
import { defaultMealForBangkok, normalizeMeal } from './lib/meal'
import { store } from './lib/storage'
import { bestGoalStreak, meetsGoal, totalsForDate } from './lib/stats'
import type { ActivityLog, BodyMeasurement, FoodLog, FoodPreset, Macro, Targets, User } from './types'

type Tab = 'today' | 'add' | 'scan' | 'menus' | 'activity' | 'history' | 'stats' | 'body' | 'health' | 'settings'
type MacroKey = 'protein' | 'carbs' | 'fat'
type BodyMetricKey = 'weight' | 'bodyFat' | 'muscleMass'
type MessageKind = 'error' | 'success' | 'info'
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const targetFields: Array<{ key: keyof Targets; label: string; unit: string }> = [
  { key: 'calories', label: 'พลังงาน', unit: 'kcal' },
  { key: 'protein', label: 'โปรตีน', unit: 'g' },
  { key: 'carbs', label: 'คาร์โบไฮเดรต', unit: 'g' },
  { key: 'fat', label: 'ไขมัน', unit: 'g' },
]
const macroCards: Array<{ key: MacroKey; label: string; barClass: string; textClass: string }> = [
  { key: 'protein', label: 'โปรตีน', barClass: 'bg-sky-500', textClass: 'text-sky-700' },
  { key: 'carbs', label: 'คาร์บ', barClass: 'bg-amber-500', textClass: 'text-amber-700' },
  { key: 'fat', label: 'ไขมัน', barClass: 'bg-rose-500', textClass: 'text-rose-700' },
]
const bodyFields: Array<{ key: BodyMetricKey; label: string; unit: string }> = [
  { key: 'weight', label: 'น้ำหนัก', unit: 'kg' },
  { key: 'bodyFat', label: 'ไขมันในร่างกาย', unit: '%' },
  { key: 'muscleMass', label: 'มวลกล้ามเนื้อ', unit: 'kg' },
]
const mealLabels: Record<FoodLog['meal'], string> = { breakfast: 'เช้า', lunch: 'กลางวัน', dinner: 'เย็น', supper: 'ค่ำ', snack: 'ของว่าง (ข้อมูลเดิม)' }

const user = ref<User | null>(store.getUser())
const tab = ref<Tab>('today')
const isOnboarding = ref(user.value !== null && !store.hasTargets())
const targets = ref<Targets>(store.getTargets())
const foods = ref<FoodLog[]>(store.getFoods())
const foodPresets = ref<FoodPreset[]>(store.getFoodPresets())
const activities = ref<ActivityLog[]>(store.getActivities())
const measurements = ref<BodyMeasurement[]>(store.getBodyMeasurements())
const message = ref('')
const messageKind = ref<MessageKind>('error')
const isEstimating = ref(false)
const isScanning = ref(false)
const scanPreview = ref('')
const scanText = ref('')
const scanServing = ref('')
const scanValues = ref<Partial<Macro>>({})
const scanFile = ref<HTMLInputElement | null>(null)
const foodNameInput = ref<HTMLInputElement | null>(null)
const isSigningIn = ref(false)
const isOnline = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
const installPrompt = ref<InstallPromptEvent | null>(null)
const isInstalled = ref(false)
const copiedSummary = ref(false)

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
const form = ref({ name: '', meal: defaultMealForBangkok() as FoodLog['meal'], date: today, calories: '', protein: '', carbs: '', fat: '' })
const editingFoodId = ref<string | null>(null)
const saveAsPreset = ref(false)
const activityForm = ref({ name: '', calories: '', date: today })
const editingActivityId = ref<string | null>(null)
const bodyForm = ref({ date: today, weight: '', bodyFat: '', muscleMass: '' })
const editingMeasurementId = ref<string | null>(null)

const todayFoods = computed(() => foods.value.filter((food) => food.date === today))
const diaryMeals: Array<{ key: FoodLog['meal']; label: string; icon: string; hint: string }> = [
  { key: 'breakfast', label: 'มื้อเช้า', icon: '☀', hint: 'เริ่มวันให้ดี' },
  { key: 'lunch', label: 'มื้อกลางวัน', icon: '◐', hint: 'เติมพลังระหว่างวัน' },
  { key: 'dinner', label: 'มื้อเย็น', icon: '☾', hint: 'ปิดท้ายวัน' },
  { key: 'supper', label: 'มื้อค่ำ', icon: '✦', hint: 'มื้อดึก' },
  { key: 'snack', label: 'ของว่าง', icon: '◇', hint: 'รายการที่บันทึกไว้เดิม' },
]
const foodsForMeal = (meal: FoodLog['meal']) => todayFoods.value.filter((food) => food.meal === meal)
const caloriesForMeal = (meal: FoodLog['meal']) => foodsForMeal(meal).reduce((sum, food) => sum + food.calories, 0)
const historyFilter = ref('')
const visibleHistoryDays = computed(() => historyFilter.value ? historyDays.value.filter((date) => date === historyFilter.value) : historyDays.value)
const todayActivities = computed(() => activities.value.filter((activity) => activity.date === today))
const totals = computed<Macro>(() => totalsForDate(foods.value, today))
const activityCalories = computed(() => burnedForDate(today))
const adjustedCalories = computed(() => targets.value.calories + activityCalories.value)
const remaining = computed<Macro>(() => ({
  calories: adjustedCalories.value - totals.value.calories,
  protein: targets.value.protein - totals.value.protein,
  carbs: targets.value.carbs - totals.value.carbs,
  fat: targets.value.fat - totals.value.fat,
}))
const todayGoalMet = computed(() => meetsGoal(totals.value, targetsForDate(today)))
const dateText = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
const historyDays = computed(() => [...new Set(foods.value.map((food) => food.date))].sort().reverse())
const sortedActivities = computed(() => [...activities.value].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)))
const recentMeasurements = computed(() => [...measurements.value].sort((a, b) => a.date.localeCompare(b.date)).slice(-7))

function localDateOffset(daysAgo: number) {
  const date = new Date(`${today}T12:00:00`)
  date.setDate(date.getDate() - daysAgo)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(date)
}
const lastSevenDays = computed(() => Array.from({ length: 7 }, (_, index) => localDateOffset(6 - index)))
const dailyTotals = (date: string) => totalsForDate(foods.value, date)
const dailyCalories = (date: string) => dailyTotals(date).calories
const weeklyCalories = computed(() => lastSevenDays.value.reduce((sum, date) => sum + dailyCalories(date), 0))
const weeklyAverage = computed(() => Math.round(weeklyCalories.value / 7))
const weeklyActivityCalories = computed(() => lastSevenDays.value.reduce((sum, date) => sum + burnedForDate(date), 0))
const weeklyNetCalories = computed(() => weeklyCalories.value - weeklyActivityCalories.value)
const weeklyActivityAverage = computed(() => Math.round(weeklyActivityCalories.value / 7))
const weeklyNetAverage = computed(() => Math.round(weeklyNetCalories.value / 7))
const statDays = computed(() => lastSevenDays.value.map((date) => ({
  date,
  food: dailyCalories(date),
  activity: burnedForDate(date),
  net: dailyCalories(date) - burnedForDate(date),
  target: targetsForDate(date).calories,
})))
const netChartMax = computed(() => Math.max(targets.value.calories, ...statDays.value.flatMap((day) => [day.food, Math.abs(day.net)]), 1))
const weeklyMacros = computed(() => lastSevenDays.value.reduce((sum, date) => {
  const total = dailyTotals(date)
  return { protein: sum.protein + total.protein, carbs: sum.carbs + total.carbs, fat: sum.fat + total.fat }
}, { protein: 0, carbs: 0, fat: 0 }))
const goalDays = computed(() => lastSevenDays.value.filter((date) => meetsGoal(dailyTotals(date), targetsForDate(date))).length)
const currentStreak = computed(() => {
  let count = 0
  for (let offset = 0; ; offset += 1) {
    const date = localDateOffset(offset)
    if (!meetsGoal(dailyTotals(date), targetsForDate(date))) break
    count += 1
  }
  return count
})
const bestStreak = computed(() => bestGoalStreak(historyDays.value, foods.value, targets.value, targetsForDate))
const messageClass = computed(() => messageKind.value === 'success' ? 'text-teal-700' : messageKind.value === 'info' ? 'text-amber-700' : 'text-red-600')
const canInstall = computed(() => Boolean(installPrompt.value) && !isInstalled.value)
const isIosDevice = computed(() => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent))

function formatHistoryDate(date: string) {
  return new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`))
}
function shortDate(date: string) {
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`))
}
function burnedForDate(date: string) {
  return activities.value.filter((activity) => activity.date === date).reduce((sum, activity) => sum + activity.calories, 0)
}
function targetsForDate(date: string): Targets {
  return { ...targets.value, calories: targets.value.calories + burnedForDate(date) }
}
function percent(value: number, target: number, cap = 100) {
  if (target <= 0) return value === 0 ? 0 : cap
  return Math.min(cap, Math.max(0, value / target * 100))
}
function macroAverage(key: MacroKey) { return Math.round(weeklyMacros.value[key] / 7 * 10) / 10 }
function macroChartHeight(date: string, key: MacroKey) { return percent(dailyTotals(date)[key], targets.value[key], 100) }
function calorieChartHeight(date: string) { return percent(dailyCalories(date), targetsForDate(date).calories, 100) }
function netChartHeight(value: number) { return Math.min(100, Math.abs(value) / netChartMax.value * 100) }
function bodyValue(item: BodyMeasurement, key: BodyMetricKey) { return item[key] }
function bodyChartHeight(item: BodyMeasurement, key: BodyMetricKey) {
  const value = bodyValue(item, key)
  if (value === undefined) return 0
  const values = recentMeasurements.value.map((entry) => bodyValue(entry, key)).filter((entry): entry is number => entry !== undefined)
  if (!values.length) return 0
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) return 65
  return 20 + (value - min) / (max - min) * 80
}
function latestBodyValue(key: BodyMetricKey) {
  for (let index = recentMeasurements.value.length - 1; index >= 0; index -= 1) {
    const value = bodyValue(recentMeasurements.value[index], key)
    if (value !== undefined) return value
  }
  return undefined
}
function bodyAverage(key: BodyMetricKey) {
  const values = measurements.value.map((item) => bodyValue(item, key)).filter((value): value is number => value !== undefined)
  if (!values.length) return undefined
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10
}
function bodyDelta(key: BodyMetricKey) {
  const values = recentMeasurements.value.map((item) => bodyValue(item, key)).filter((value): value is number => value !== undefined)
  if (values.length < 2) return null
  return Math.round((values.at(-1)! - values[0]) * 10) / 10
}
function signed(value: number | null) { return value === null ? '—' : `${value > 0 ? '+' : ''}${value}` }
function setMessage(text: string, kind: MessageKind = 'error') { message.value = text; messageKind.value = kind }
function clearMessage() { message.value = '' }
function goTo(next: Tab) { clearMessage(); tab.value = next }
function weeklySummaryText() {
  const days = statDays.value.map((day) => {
    const macro = dailyTotals(day.date)
    return `- ${formatHistoryDate(day.date)}: อาหาร ${day.food.toLocaleString()} kcal | กิจกรรม ${day.activity.toLocaleString()} kcal | Net ${day.net.toLocaleString()} kcal | P ${macro.protein}g C ${macro.carbs}g F ${macro.fat}g`
  })
  const body = bodyFields.map((field) => `- ${field.label}: ล่าสุด ${latestBodyValue(field.key) ?? '—'} ${field.unit} | เฉลี่ย ${bodyAverage(field.key) ?? '—'} ${field.unit} | เปลี่ยน ${signed(bodyDelta(field.key))} ${field.unit}`)
  const bodyHistory = measurements.value.length ? measurements.value.map((item) => `- ${formatHistoryDate(item.date)}: น้ำหนัก ${item.weight ?? '—'} kg | ไขมัน ${item.bodyFat ?? '—'}% | กล้ามเนื้อ ${item.muscleMass ?? '—'} kg`) : ['- ยังไม่มีข้อมูลร่างกาย']
  return [`สรุปสุขภาพ 7 วันล่าสุด (${shortDate(lastSevenDays.value[0])} – ${shortDate(lastSevenDays.value.at(-1)!)})`, '', 'รายวัน (Net = อาหาร - กิจกรรม)', ...days, '', 'ค่าเฉลี่ยและยอดรวม', `- อาหารเฉลี่ย: ${weeklyAverage.value.toLocaleString()} kcal/วัน`, `- กิจกรรมเฉลี่ย: ${weeklyActivityAverage.value.toLocaleString()} kcal/วัน`, `- Net Calories เฉลี่ย: ${weeklyNetAverage.value.toLocaleString()} kcal/วัน`, `- รวมอาหาร: ${weeklyCalories.value.toLocaleString()} kcal | รวมกิจกรรม: ${weeklyActivityCalories.value.toLocaleString()} kcal | Net รวม: ${weeklyNetCalories.value.toLocaleString()} kcal`, `- โปรตีนเฉลี่ย: ${macroAverage('protein')} g/วัน | คาร์บเฉลี่ย: ${macroAverage('carbs')} g/วัน | ไขมันเฉลี่ย: ${macroAverage('fat')} g/วัน`, '', 'สัดส่วนร่างกาย', ...body, '', 'ประวัติร่างกายทั้งหมด', ...bodyHistory, '', `เป้าครบทุก macro: ${goalDays.value}/7 วัน`, `Current streak: ${currentStreak.value} วัน | Best streak: ${bestStreak.value} วัน`].join('\n')
}
async function copyWeeklySummary() {
  try {
    await navigator.clipboard.writeText(weeklySummaryText())
    copiedSummary.value = true
    setTimeout(() => { copiedSummary.value = false }, 2_500)
  } catch {
    setMessage('ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาอนุญาต Clipboard ในเบราว์เซอร์')
  }
}

async function login() {
  clearMessage()
  isSigningIn.value = true
  try {
    await signInWithGoogle((profile) => {
      user.value = profile
      store.setUser(profile)
      targets.value = store.getTargets()
      isOnboarding.value = !store.hasTargets()
    })
  } catch (reason) {
    setMessage(reason instanceof Error ? reason.message : 'เข้าสู่ระบบไม่สำเร็จ')
  } finally {
    isSigningIn.value = false
  }
}
function saveTargets() {
  if (Object.values(targets.value).some((value) => !Number.isFinite(value) || value < 0)) {
    setMessage('เป้าหมายต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป')
    return
  }
  store.setTargets(targets.value)
  isOnboarding.value = false
  setMessage('บันทึกเป้าหมายแล้ว', 'success')
  tab.value = 'today'
}

function resetFoodForm() {
  form.value = { name: '', meal: defaultMealForBangkok(), date: today, calories: '', protein: '', carbs: '', fat: '' }
  editingFoodId.value = null
  saveAsPreset.value = false
  clearMessage()
}
function openFoodForm() { resetFoodForm(); tab.value = 'add' }
function openFoodForMeal(meal: FoodLog['meal']) { resetFoodForm(); form.value.meal = meal; tab.value = 'add' }
function focusFoodInput() { foodNameInput.value?.focus() }
function openScanner() { clearMessage(); tab.value = 'scan' }
function resetScan() { scanPreview.value = ''; scanText.value = ''; scanServing.value = ''; scanValues.value = {}; if (scanFile.value) scanFile.value.value = '' }
async function onScanFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  resetScan()
  if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 3 * 1024 * 1024) {
    setMessage('เลือกรูป JPG หรือ PNG ขนาดไม่เกิน 3 MB')
    return
  }
  try {
    scanPreview.value = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    clearMessage()
  } catch { setMessage('เปิดรูปภาพไม่สำเร็จ กรุณาเลือกใหม่') }
}
async function scanNutritionLabel() {
  if (!scanPreview.value) return
  isScanning.value = true
  clearMessage()
  try {
    const response = await fetch('/api/scan-label', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: scanPreview.value }) })
    const result = await response.json()
    if (!response.ok) throw new Error(result?.error || 'สแกนฉลากไม่สำเร็จ')
    scanText.value = result.text
    scanServing.value = result.serving
    scanValues.value = result.values
    setMessage('อ่านฉลากแล้ว กรุณาตรวจตัวเลขและหน่วยบริโภคก่อนบันทึก', 'success')
  } catch (error) { setMessage(error instanceof Error ? error.message : 'สแกนฉลากไม่สำเร็จ') }
  finally { isScanning.value = false }
}
function useScanResult() {
  resetFoodForm()
  for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) {
    const value = scanValues.value[key]
    form.value[key] = value === undefined ? '' : String(value)
  }
  form.value.name = ''
  tab.value = 'add'
  setMessage('กรอกชื่ออาหาร และตรวจค่าจากฉลากก่อนบันทึก', 'info')
}
function openPresetCreator() { resetFoodForm(); saveAsPreset.value = true; tab.value = 'add' }
function saveFood() {
  const value = form.value
  if (!value.name.trim()) { setMessage('กรุณาระบุชื่ออาหาร'); return }
  const numeric = [value.calories, value.protein, value.carbs, value.fat].map(Number)
  if (numeric.some((item) => !Number.isFinite(item) || item < 0)) { setMessage('พลังงานและสารอาหารต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป'); return }
  const original = foods.value.find((item) => item.id === editingFoodId.value)
  const food: FoodLog = {
    id: editingFoodId.value ?? crypto.randomUUID(),
    name: value.name.trim(),
    meal: value.meal,
    date: value.date,
    createdAt: original?.createdAt ?? new Date().toISOString(),
    calories: Number(value.calories) || 0,
    protein: Number(value.protein) || 0,
    carbs: Number(value.carbs) || 0,
    fat: Number(value.fat) || 0,
  }
  if (editingFoodId.value) store.updateFood(food); else store.saveFood(food)
  if (!editingFoodId.value && saveAsPreset.value) {
    store.saveFoodPreset({ id: crypto.randomUUID(), name: food.name, meal: food.meal, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, createdAt: new Date().toISOString() })
    foodPresets.value = store.getFoodPresets()
  }
  foods.value = store.getFoods()
  resetFoodForm()
  tab.value = food.date === today ? 'today' : 'history'
}
function applyFoodPreset(preset: FoodPreset) {
  form.value = { name: preset.name, meal: normalizeMeal(preset.meal), date: form.value.date, calories: String(preset.calories), protein: String(preset.protein), carbs: String(preset.carbs), fat: String(preset.fat) }
  setMessage(`เลือกเมนู “${preset.name}” แล้ว แก้ไขได้ก่อนบันทึก`, 'info')
}
function useFoodPreset(preset: FoodPreset) { resetFoodForm(); applyFoodPreset(preset); tab.value = 'add' }
function saveFoodAsPreset(food: FoodLog) {
  store.saveFoodPreset({ id: crypto.randomUUID(), name: food.name, meal: food.meal, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat, createdAt: new Date().toISOString() })
  foodPresets.value = store.getFoodPresets()
  setMessage(`บันทึก “${food.name}” เป็นเมนูของฉันแล้ว`, 'success')
}
function deleteFoodPreset(id: string) {
  const preset = foodPresets.value.find((item) => item.id === id)
  if (!preset || !confirm(`ลบเมนู “${preset.name}” หรือไม่?`)) return
  store.deleteFoodPreset(id)
  foodPresets.value = store.getFoodPresets()
}
async function estimateFood() {
  if (!isOnline.value) { setMessage('ขณะนี้ออฟไลน์อยู่ การประเมินด้วย AI ต้องใช้อินเทอร์เน็ต'); return }
  isEstimating.value = true
  clearMessage()
  try {
    const result = await estimateNutritionWithAI(form.value.name)
    form.value.calories = String(result.calories)
    form.value.protein = String(result.protein)
    form.value.carbs = String(result.carbs)
    form.value.fat = String(result.fat)
    setMessage('AI ประเมินแล้ว โปรดตรวจและแก้ไขตัวเลขก่อนบันทึก', 'info')
  } catch (reason) {
    const suffix = reason instanceof AiEstimateError && reason.retryable ? ' กดประเมินอีกครั้งเพื่อลองใหม่' : ''
    setMessage(`${reason instanceof Error ? reason.message : 'ไม่สามารถประเมินอาหารได้'}${suffix}`)
  } finally {
    isEstimating.value = false
  }
}
function editFood(food: FoodLog) {
  editingFoodId.value = food.id
  form.value = { name: food.name, meal: normalizeMeal(food.meal), date: food.date, calories: String(food.calories), protein: String(food.protein), carbs: String(food.carbs), fat: String(food.fat) }
  clearMessage()
  tab.value = 'add'
}
function removeFood(id: string) {
  const item = foods.value.find((food) => food.id === id)
  if (!confirm(`ลบ${item ? ` “${item.name}”` : 'รายการอาหารนี้'}หรือไม่?`)) return
  store.deleteFood(id)
  foods.value = store.getFoods()
  if (editingFoodId.value === id) resetFoodForm()
}

function resetActivityForm() {
  activityForm.value = { name: '', calories: '', date: today }
  editingActivityId.value = null
  clearMessage()
}
function saveActivity() {
  const calories = Number(activityForm.value.calories)
  if (!activityForm.value.name.trim() || !Number.isFinite(calories) || calories <= 0) { setMessage('กรุณาระบุกิจกรรมและแคลอรีที่เผาผลาญมากกว่า 0'); return }
  const original = activities.value.find((item) => item.id === editingActivityId.value)
  const activity: ActivityLog = {
    id: editingActivityId.value ?? crypto.randomUUID(),
    name: activityForm.value.name.trim(),
    calories,
    date: activityForm.value.date,
    createdAt: original?.createdAt ?? new Date().toISOString(),
  }
  if (editingActivityId.value) store.updateActivity(activity); else store.saveActivity(activity)
  activities.value = store.getActivities()
  resetActivityForm()
  setMessage('บันทึกกิจกรรมแล้ว', 'success')
}
function editActivity(item: ActivityLog) {
  editingActivityId.value = item.id
  activityForm.value = { name: item.name, calories: String(item.calories), date: item.date }
  clearMessage()
  tab.value = 'activity'
}
function removeActivity(id: string) {
  const item = activities.value.find((activity) => activity.id === id)
  if (!confirm(`ลบ${item ? ` “${item.name}”` : 'กิจกรรมนี้'}หรือไม่?`)) return
  store.deleteActivity(id)
  activities.value = store.getActivities()
  if (editingActivityId.value === id) resetActivityForm()
}

function resetBodyForm() {
  bodyForm.value = { date: today, weight: '', bodyFat: '', muscleMass: '' }
  editingMeasurementId.value = null
  clearMessage()
}
function saveBodyMeasurement() {
  const value = bodyForm.value
  const entered = [value.weight, value.bodyFat, value.muscleMass].filter((item) => item !== '')
  if (!entered.length || entered.some((item) => !Number.isFinite(Number(item)) || Number(item) < 0)) { setMessage('กรุณากรอกข้อมูลอย่างน้อย 1 ค่า และใช้ตัวเลขตั้งแต่ 0 ขึ้นไป'); return }
  const original = measurements.value.find((item) => item.id === editingMeasurementId.value)
  const measurement: BodyMeasurement = {
    id: editingMeasurementId.value ?? crypto.randomUUID(),
    date: value.date,
    createdAt: original?.createdAt ?? new Date().toISOString(),
    weight: value.weight === '' ? undefined : Number(value.weight),
    bodyFat: value.bodyFat === '' ? undefined : Number(value.bodyFat),
    muscleMass: value.muscleMass === '' ? undefined : Number(value.muscleMass),
  }
  if (editingMeasurementId.value) store.updateBodyMeasurement(measurement); else store.saveBodyMeasurement(measurement)
  measurements.value = store.getBodyMeasurements()
  resetBodyForm()
  setMessage('บันทึกข้อมูลร่างกายแล้ว', 'success')
}
function editBodyMeasurement(item: BodyMeasurement) {
  editingMeasurementId.value = item.id
  bodyForm.value = {
    date: item.date,
    weight: item.weight === undefined ? '' : String(item.weight),
    bodyFat: item.bodyFat === undefined ? '' : String(item.bodyFat),
    muscleMass: item.muscleMass === undefined ? '' : String(item.muscleMass),
  }
  clearMessage()
  tab.value = 'body'
}
function removeBodyMeasurement(id: string) {
  if (!confirm('ลบข้อมูลร่างกายรายการนี้หรือไม่?')) return
  store.deleteBodyMeasurement(id)
  measurements.value = store.getBodyMeasurements()
  if (editingMeasurementId.value === id) resetBodyForm()
}

function deleteAccountAndData() {
  if (!confirm('ลบบัญชีในแอปและข้อมูลทั้งหมดบนอุปกรณ์นี้อย่างถาวรหรือไม่? การดำเนินการนี้ย้อนกลับไม่ได้')) return
  store.clearAll()
  user.value = null
  targets.value = store.getTargets()
  foods.value = []
  foodPresets.value = []
  activities.value = []
  measurements.value = []
  isOnboarding.value = false
  tab.value = 'today'
  resetFoodForm()
  resetActivityForm()
  resetBodyForm()
}
function logout() { store.clearUser(); user.value = null; tab.value = 'today'; clearMessage() }

function updateOnlineStatus() { isOnline.value = navigator.onLine }
function handleInstallPrompt(event: Event) {
  event.preventDefault()
  installPrompt.value = event as InstallPromptEvent
}
function handleInstalled() { isInstalled.value = true; installPrompt.value = null }
async function installApp() {
  if (!installPrompt.value) return
  const prompt = installPrompt.value
  await prompt.prompt()
  const choice = await prompt.userChoice
  if (choice.outcome === 'accepted') setMessage('กำลังติดตั้งแอปลงบนอุปกรณ์', 'success')
  installPrompt.value = null
}

onMounted(() => {
  const iosNavigator = navigator as Navigator & { standalone?: boolean }
  isInstalled.value = window.matchMedia('(display-mode: standalone)').matches || iosNavigator.standalone === true
  window.addEventListener('online', updateOnlineStatus)
  window.addEventListener('offline', updateOnlineStatus)
  window.addEventListener('beforeinstallprompt', handleInstallPrompt)
  window.addEventListener('appinstalled', handleInstalled)
  void loadGoogleIdentity().catch(() => undefined)
  if (new URLSearchParams(window.location.search).get('action') === 'add-food' && user.value && !isOnboarding.value) {
    openFoodForm()
    window.history.replaceState({}, '', window.location.pathname)
  }
})
onBeforeUnmount(() => {
  window.removeEventListener('online', updateOnlineStatus)
  window.removeEventListener('offline', updateOnlineStatus)
  window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
  window.removeEventListener('appinstalled', handleInstalled)
})
</script>

<template>
  <main class="app-shell mx-auto min-h-screen max-w-lg pb-28">
    <section v-if="!user" class="flex min-h-screen flex-col justify-center px-6 text-center">
      <img src="/icon-192.png" alt="" class="mx-auto mb-6 h-20 w-20 rounded-3xl shadow-lg" width="80" height="80">
      <h1 class="text-3xl font-bold tracking-tight">แคลกูเอง</h1>
      <p class="mt-3 text-slate-600">บันทึกอาหารง่าย ๆ<br>รู้ทันทีว่าวันนี้เหลือกินได้เท่าไร</p>
      <button type="button" :disabled="isSigningIn || !isOnline" class="mt-10 rounded-2xl bg-teal-700 px-5 py-4 font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50" @click="login">
        {{ !isOnline ? 'ออฟไลน์ — ต้องเชื่อมต่ออินเทอร์เน็ต' : isSigningIn ? 'กำลังเปิด Google…' : 'ดำเนินการต่อด้วย Google' }}
      </button>
      <p v-if="message" class="mt-4 text-sm" :class="messageClass" role="status" aria-live="polite">{{ message }}</p>
    </section>

    <section v-else-if="isOnboarding" class="px-5 py-10">
      <p class="text-sm font-medium text-teal-700">เริ่มต้นใช้งาน</p>
      <h1 class="mt-1 text-3xl font-bold">เป้าหมายของคุณ</h1>
      <p class="mt-2 text-slate-600">ตั้งเป้ารายวันก่อนเริ่มบันทึกอาหาร แก้ไขภายหลังได้เสมอ</p>
      <div class="mt-8 space-y-4">
        <label v-for="item in targetFields" :key="item.key" class="block rounded-2xl bg-white p-4 shadow-sm">
          <span class="font-semibold">{{ item.label }}</span>
          <div class="mt-2 flex items-center gap-2">
            <input v-model.number="targets[item.key]" min="0" type="number" inputmode="decimal" class="w-full rounded-xl bg-stone-100 px-3 py-2 outline-teal-600" :aria-label="`${item.label} ${item.unit}`">
            <span class="w-10 text-sm text-slate-500">{{ item.unit }}</span>
          </div>
        </label>
      </div>
      <p v-if="message" class="mt-4 text-sm" :class="messageClass" role="status">{{ message }}</p>
      <button type="button" class="mt-6 w-full rounded-2xl bg-teal-700 py-4 font-semibold text-white" @click="saveTargets">บันทึกเป้าหมาย</button>
    </section>

    <template v-else>
      <header v-if="tab === 'today'" class="app-header flex items-center justify-between px-5 pb-5 pt-7">
        <div><p class="header-eyebrow">แคลกูเอง <span>· {{ dateText }}</span></p><h1 class="text-2xl font-bold">สวัสดี {{ user.name?.split(' ')[0] || 'คุณ' }} <span aria-hidden="true">✳</span></h1></div>
        <button type="button" class="profile-button" aria-label="เปิดตั้งค่า" @click="goTo('settings')"><img v-if="user.picture" :src="user.picture" class="h-10 w-10 rounded-full" :alt="`รูปโปรไฟล์ของ ${user.name}`" width="40" height="40" referrerpolicy="no-referrer"><span v-else>☻</span></button>
      </header>

      <div v-if="tab === 'today' && canInstall" class="px-5 pb-3">
        <div class="flex items-center gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-4">
          <div class="flex-1"><p class="font-semibold text-teal-900">ติดตั้งแคลกูเอง</p><p class="text-sm text-teal-800">เปิดจากหน้าจอหลักได้เหมือนแอป</p></div>
          <button type="button" class="rounded-xl bg-teal-700 px-3 py-2 text-sm font-semibold text-white" @click="installApp">ติดตั้ง</button>
        </div>
      </div>

      <section v-if="tab === 'today'" class="page-section today-page px-5">
        <div class="page-heading"><div><p class="page-kicker">ภาพรวมรายวัน</p><h1>วันนี้ของคุณ</h1></div><span class="date-pill">{{ dateText }}</span></div>
        <div class="overview-panel">
          <div class="overview-top"><span>เป้าหมายพลังงาน</span><button type="button" @click="goTo('settings')">แก้ไขเป้า ↗</button></div>
          <div class="overview-main">
            <div class="calorie-ring" :style="{ '--progress': `${percent(totals.calories, adjustedCalories)}%` }" role="progressbar" aria-label="พลังงานที่กินวันนี้" :aria-valuenow="totals.calories" :aria-valuemax="adjustedCalories || 1"><div><strong>{{ Math.max(0, remaining.calories).toLocaleString() }}</strong><small>kcal คงเหลือ</small></div></div>
            <div class="overview-copy"><p>{{ todayGoalMet ? 'ครบเป้าหมายแล้ว' : 'ยังเลือกกินได้อีก' }}</p><strong>{{ Math.max(0, remaining.calories).toLocaleString() }} <span>kcal</span></strong><small>วางแผนมื้อต่อไปได้ง่ายขึ้น</small></div>
          </div>
          <div class="overview-metrics"><div><span>กินแล้ว</span><strong>{{ totals.calories.toLocaleString() }}</strong></div><div><span>เป้าหมาย</span><strong>{{ adjustedCalories.toLocaleString() }}</strong></div><div><span>กิจกรรม</span><strong>+{{ activityCalories.toLocaleString() }}</strong></div></div>
        </div>

        <div class="action-grid"><button type="button" class="action-tile action-food" @click="openFoodForm"><span class="action-symbol">＋</span><strong>เพิ่มอาหาร</strong><small>พิมพ์หรือเลือกเมนู</small></button><button type="button" class="action-tile action-scan" @click="openScanner"><span class="action-symbol">▣</span><strong>สแกนฉลาก</strong><small>ถ่ายรูปแล้วอ่านทันที</small></button></div>

        <div class="section-heading"><div><p class="page-kicker">บันทึกประจำวัน</p><h2>อาหารแต่ละมื้อ</h2></div><button type="button" @click="goTo('history')">ดูประวัติ →</button></div>
        <div class="meal-list">
          <section v-for="meal in diaryMeals" :key="meal.key" class="meal-card">
            <div class="meal-card-head"><span class="meal-symbol">{{ meal.icon }}</span><div class="meal-title"><h3>{{ meal.label }}</h3><small>{{ foodsForMeal(meal.key).length ? `${foodsForMeal(meal.key).length} รายการ` : meal.hint }}</small></div><strong>{{ caloriesForMeal(meal.key).toLocaleString() }} <small>kcal</small></strong></div>
            <div v-if="foodsForMeal(meal.key).length" class="meal-items"><div v-for="food in foodsForMeal(meal.key)" :key="food.id" class="meal-item"><div><strong>{{ food.name }}</strong><small>P {{ food.protein }} · C {{ food.carbs }} · F {{ food.fat }} g</small></div><div class="meal-item-actions"><span>{{ food.calories }} kcal</span><button type="button" :aria-label="`แก้ไข ${food.name}`" @click="editFood(food)">แก้ไข</button></div></div></div>
            <button v-if="meal.key !== 'snack'" type="button" class="meal-add" @click="openFoodForMeal(meal.key)">＋ เพิ่ม{{ meal.label }}</button>
          </section>
        </div>

        <div class="section-heading"><div><p class="page-kicker">สารอาหาร</p><h2>สมดุลวันนี้</h2></div><button type="button" @click="goTo('stats')">ดูสถิติ →</button></div>
        <div class="macro-list"><div v-for="macro in macroCards" :key="macro.key" class="macro-row"><div class="macro-row-top"><span>{{ macro.label }}</span><strong>{{ totals[macro.key] }} <small>/ {{ targets[macro.key] }} g</small></strong></div><div class="macro-track" role="progressbar" :aria-label="macro.label" :aria-valuenow="totals[macro.key]" :aria-valuemax="targets[macro.key] || 1"><span :class="macro.barClass" :style="{ width: `${percent(totals[macro.key], targets[macro.key])}%` }" /></div></div></div>

        <button type="button" class="activity-shortcut" @click="goTo('activity')"><span class="activity-symbol">↗</span><span><strong>กิจกรรมวันนี้</strong><small>{{ todayActivities.length ? `${todayActivities.length} รายการ · เผาผลาญ ${activityCalories} kcal` : 'เพิ่มกิจกรรมเพื่อปรับเป้าพลังงาน' }}</small></span><span>→</span></button>
      </section>

      <section v-else-if="tab === 'add'" class="px-5">
        <div class="page-heading"><div><p class="page-kicker">บันทึกอาหาร</p><h1>{{ editingFoodId ? 'แก้ไขรายการ' : 'เพิ่มมื้อใหม่' }}</h1></div><button type="button" class="close-page" aria-label="กลับหน้าวันนี้" @click="resetFoodForm(); goTo('today')">×</button></div>
        <p class="page-intro">{{ editingFoodId ? 'แก้ไขข้อมูลแล้วบันทึกอีกครั้ง' : 'เลือกวิธีที่สะดวก แล้วตรวจข้อมูลก่อนบันทึก' }}</p>
        <div v-if="!editingFoodId" class="entry-methods"><button type="button" class="entry-method is-selected" @click="focusFoodInput"><span>✦</span><strong>พิมพ์ / AI</strong></button><button type="button" class="entry-method" @click="openScanner"><span>▣</span><strong>สแกนฉลาก</strong></button><button type="button" class="entry-method" @click="goTo('menus')"><span>▤</span><strong>เมนูเดิม</strong></button></div>
        <form class="entry-form" @submit.prevent="saveFood">
          <div class="form-panel"><div class="form-step"><span>01</span><div><h2>อาหารที่กิน</h2><p>ระบุชื่อและเลือกมื้อ</p></div></div>
            <label class="field-label"><span>ชื่ออาหาร</span><input ref="foodNameInput" v-model="form.name" :disabled="isEstimating" maxlength="500" placeholder="เช่น กะเพราไก่ไข่ดาว 1 จาน"></label>
            <button v-if="!editingFoodId" type="button" :disabled="isEstimating || !isOnline || !form.name.trim()" class="estimate-button" @click="estimateFood">{{ !isOnline ? 'ต้องเชื่อมต่ออินเทอร์เน็ต' : isEstimating ? 'กำลังประเมิน…' : '✦ ให้ AI ประเมินสารอาหาร' }}</button>
            <div class="field-grid"><label class="field-label"><span>วันที่</span><input v-model="form.date" type="date"></label><label class="field-label"><span>มื้ออาหาร</span><select v-model="form.meal"><option value="breakfast">มื้อเช้า</option><option value="lunch">มื้อกลางวัน</option><option value="dinner">มื้อเย็น</option><option value="supper">มื้อค่ำ</option></select></label></div>
          </div>
          <div class="form-panel"><div class="form-step"><span>02</span><div><h2>ข้อมูลโภชนาการ</h2><p>ตรวจตัวเลขต่อหนึ่งมื้อที่กินจริง</p></div></div><div class="nutrition-fields"><label v-for="item in targetFields" :key="item.key" class="field-label"><span>{{ item.label }}</span><div class="input-unit"><input v-model="form[item.key]" type="number" min="0" step="0.1" inputmode="decimal" placeholder="0"><small>{{ item.unit }}</small></div></label></div></div>
          <label v-if="!editingFoodId" class="preset-toggle"><input v-model="saveAsPreset" type="checkbox"><span><strong>เก็บเป็นเมนูของฉัน</strong><small>เลือกใช้ซ้ำได้ในครั้งต่อไป</small></span></label>
          <p v-if="message" class="form-message" :class="messageClass" role="status" aria-live="polite">{{ message }}</p>
          <div class="form-actions"><button v-if="editingFoodId" type="button" class="secondary-action" @click="resetFoodForm(); goTo('today')">ยกเลิก</button><button :disabled="isEstimating" class="primary-action">{{ editingFoodId ? 'บันทึกการแก้ไข' : 'บันทึกอาหาร' }} →</button></div>
        </form>
      </section>

      <section v-else-if="tab === 'scan'" class="px-5">
        <div class="flex items-center gap-3"><button type="button" class="touch-button text-2xl" aria-label="กลับหน้าเพิ่มอาหาร" @click="goTo('add')">‹</button><div><p class="section-eyebrow">บันทึกให้ง่ายขึ้น</p><h1 class="text-2xl font-bold">สแกนฉลากอาหาร</h1></div></div>
        <p class="mt-3 text-slate-600">ถ่ายรูปตารางโภชนาการให้ชัด อ่านตัวเลขจากฉลาก แล้วตรวจอีกครั้งก่อนบันทึก</p>
        <label class="scan-drop"><input ref="scanFile" type="file" accept="image/jpeg,image/png" capture="environment" class="sr-only" @change="onScanFile"><img v-if="scanPreview" :src="scanPreview" alt="รูปฉลากที่เลือก" class="scan-preview"><template v-else><span class="scan-camera">▣</span><strong>แตะเพื่อถ่ายรูปหรือเลือกรูป</strong><small>JPG หรือ PNG · ไม่เกิน 3 MB</small></template></label>
        <button type="button" class="primary-action mt-4 w-full" :disabled="!scanPreview || isScanning || !isOnline" @click="scanNutritionLabel">{{ isScanning ? 'กำลังอ่านฉลาก…' : !isOnline ? 'ต้องเชื่อมต่ออินเทอร์เน็ต' : 'อ่านข้อมูลจากฉลาก' }}</button>
        <p v-if="message" class="mt-4 text-sm" :class="messageClass" role="status" aria-live="polite">{{ message }}</p>
        <div v-if="scanText" class="scan-result"><div class="flex items-center justify-between"><h2 class="text-lg font-bold">ข้อมูลที่อ่านได้</h2><span class="result-badge">ตรวจสอบก่อนใช้</span></div><p v-if="scanServing" class="mt-2 text-sm text-slate-600">{{ scanServing }}</p><div class="scan-grid"><div v-for="item in targetFields" :key="item.key"><small>{{ item.label }}</small><strong>{{ scanValues[item.key] ?? '—' }} <span v-if="scanValues[item.key] !== undefined">{{ item.unit }}</span></strong></div></div><button type="button" class="primary-action mt-5 w-full" @click="useScanResult">นำไปกรอกอาหาร →</button><details class="mt-5"><summary class="cursor-pointer text-sm font-semibold text-teal-800">ดูข้อความจากฉลาก</summary><pre class="scan-raw">{{ scanText }}</pre></details></div>
      </section>

      <section v-else-if="tab === 'menus'" class="px-5">
        <div class="flex items-center gap-3"><button type="button" class="touch-button text-2xl" aria-label="กลับหน้าเพิ่มอาหาร" @click="openFoodForm">‹</button><div><h1 class="text-2xl font-bold">เมนูอาหาร</h1><p class="text-sm text-slate-600">จัดการอาหารที่กินซ้ำบ่อย</p></div></div>
        <button type="button" class="mt-6 w-full rounded-2xl bg-teal-700 py-4 font-semibold text-white" @click="openPresetCreator">+ เพิ่มเมนูใหม่</button>
        <p v-if="foodPresets.length === 0" class="mt-6 rounded-2xl bg-white p-6 text-center text-slate-500">ยังไม่มีเมนูอาหารที่บันทึกไว้</p>
        <div v-else class="mt-6 space-y-3"><article v-for="preset in foodPresets" :key="preset.id" class="rounded-2xl bg-white p-4 shadow-sm"><div class="flex items-start gap-3"><div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ preset.name }}</p><p class="mt-1 text-sm text-slate-500">{{ mealLabels[preset.meal] }} · {{ preset.calories }} kcal</p><p class="text-xs text-slate-500">P {{ preset.protein }}g · C {{ preset.carbs }}g · F {{ preset.fat }}g</p></div><button type="button" class="rounded-xl bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800" @click="useFoodPreset(preset)">เลือกใช้</button></div><button type="button" class="mt-3 w-full rounded-xl border border-red-200 py-2 text-sm font-semibold text-red-600" @click="deleteFoodPreset(preset.id)">ลบเมนูนี้</button></article></div>
      </section>

      <section v-else-if="tab === 'history'" class="px-5">
        <div class="page-heading"><div><p class="page-kicker">บันทึกย้อนหลัง</p><h1>ประวัติอาหาร</h1></div><span class="count-pill">{{ foods.length }} รายการ</span></div>
        <div class="history-filter"><label for="history-date">เลือกวันที่</label><input id="history-date" v-model="historyFilter" type="date"><button v-if="historyFilter" type="button" @click="historyFilter = ''">ดูทั้งหมด</button></div>
        <div v-if="historyDays.length === 0" class="empty-state mt-5"><span class="empty-icon">◌</span><p class="font-semibold">ยังไม่มีประวัติอาหาร</p><button type="button" class="text-teal-700" @click="openFoodForm">เพิ่มอาหารมื้อแรก →</button></div>
        <p v-else-if="visibleHistoryDays.length === 0" class="empty-state mt-5">ไม่มีรายการในวันที่เลือก</p>
        <div v-else class="history-days"><section v-for="day in visibleHistoryDays" :key="day" class="history-day"><div class="history-day-head"><div><h2>{{ formatHistoryDate(day) }}</h2><small>{{ foods.filter((item) => item.date === day).length }} รายการ</small></div><strong>{{ dailyCalories(day).toLocaleString() }} <small>kcal</small></strong></div><article v-for="food in foods.filter((item) => item.date === day)" :key="food.id" class="history-item"><div><span class="history-meal">{{ mealLabels[food.meal] }}</span><h3>{{ food.name }}</h3><small>P {{ food.protein }} · C {{ food.carbs }} · F {{ food.fat }} g</small></div><div><strong>{{ food.calories }} kcal</strong><button type="button" @click="editFood(food)">แก้ไข</button></div></article></section></div>
      </section>

      <section v-else-if="tab === 'stats'" class="px-5">
        <h1 class="text-2xl font-bold">สถิติ</h1><p class="mt-2 text-slate-600">พลังงาน สารอาหาร และสัดส่วนใน 7 รายการ/วันล่าสุด</p>
        <div class="mt-5 flex items-center justify-between gap-3"><p class="text-sm text-slate-600">ข้อมูลอาหาร กิจกรรม และสัดส่วน 7 วันล่าสุด</p><button type="button" class="shrink-0 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800" @click="copyWeeklySummary">{{ copiedSummary ? 'คัดลอกแล้ว ✓' : 'คัดลอกสรุป 7 วัน' }}</button></div>
        <div class="mt-4 grid grid-cols-2 gap-3"><div class="rounded-2xl bg-teal-700 p-4 text-white"><p class="text-sm text-teal-100">อาหารเฉลี่ย 7 วัน</p><p class="mt-1 text-2xl font-bold">{{ weeklyAverage.toLocaleString() }} <span class="text-sm font-normal">kcal/วัน</span></p></div><div class="rounded-2xl bg-white p-4 shadow-sm"><p class="text-sm text-slate-500">ครบทุกเป้า 7 วัน</p><p class="mt-1 text-2xl font-bold">{{ goalDays }} <span class="text-sm font-normal">/ 7 วัน</span></p></div><div class="rounded-2xl bg-white p-4 shadow-sm"><p class="text-sm text-slate-500">กิจกรรมเฉลี่ย 7 วัน</p><p class="mt-1 text-2xl font-bold text-sky-700">{{ weeklyActivityAverage.toLocaleString() }} <span class="text-sm font-normal">kcal/วัน</span></p></div><div class="rounded-2xl bg-violet-50 p-4 shadow-sm"><p class="text-sm text-violet-800">Net Calories เฉลี่ย</p><p class="mt-1 text-2xl font-bold text-violet-700">{{ weeklyNetAverage.toLocaleString() }} <span class="text-sm font-normal">kcal/วัน</span></p><p class="mt-1 text-[10px] text-violet-700">อาหาร − กิจกรรม</p></div></div>

        <div class="mt-6 rounded-3xl bg-white p-5 shadow-sm">
          <div class="flex items-baseline justify-between"><h2 class="font-bold">แคลอรีรายวัน</h2><p class="text-xs text-slate-500">เป้าปรับตามกิจกรรม</p></div>
          <div class="mt-5 flex h-40 items-end justify-between gap-2" role="img" aria-label="กราฟแคลอรี 7 วันล่าสุด"><div v-for="date in lastSevenDays" :key="date" class="flex h-full min-w-0 flex-1 flex-col justify-end"><p class="mb-1 truncate text-center text-[10px] font-medium">{{ dailyCalories(date) || '-' }}</p><div class="rounded-t-lg bg-teal-600" :style="{ height: `${calorieChartHeight(date)}%`, minHeight: dailyCalories(date) ? '4px' : '0' }"/><p class="mt-2 text-center text-[10px] text-slate-500">{{ shortDate(date).split(' ')[0] }}</p></div></div>
        </div>

        <div class="mt-4 rounded-3xl bg-white p-5 shadow-sm">
          <div class="flex items-baseline justify-between"><div><h2 class="font-bold">Net Calories & กิจกรรม</h2><p class="mt-1 text-xs text-slate-500">Net = แคลอรีอาหาร − แคลอรีจากกิจกรรม</p></div><p class="text-xs font-semibold text-violet-700">เฉลี่ย {{ weeklyNetAverage.toLocaleString() }} kcal/วัน</p></div>
          <div class="mt-5 flex h-40 items-end justify-between gap-2" role="img" aria-label="กราฟ Net Calories และกิจกรรม 7 วันล่าสุด">
            <div v-for="day in statDays" :key="`net-${day.date}`" class="flex h-full min-w-0 flex-1 flex-col justify-end">
              <p class="mb-1 truncate text-center text-[10px] font-medium text-violet-800">{{ day.net }}</p>
              <div class="flex h-28 items-end justify-center gap-0.5"><div class="w-1/2 rounded-t-md bg-violet-600" :style="{ height: `${netChartHeight(day.net)}%`, minHeight: day.net ? '3px' : '0' }"/><div class="w-1/2 rounded-t-md bg-sky-400" :style="{ height: `${netChartHeight(day.activity)}%`, minHeight: day.activity ? '3px' : '0' }"/></div>
              <p class="mt-2 text-center text-[10px] text-slate-500">{{ shortDate(day.date).split(' ')[0] }}</p>
            </div>
          </div>
          <div class="mt-3 flex gap-4 text-xs text-slate-600"><span><i class="mr-1 inline-block h-2 w-2 rounded-sm bg-violet-600"/>Net calories</span><span><i class="mr-1 inline-block h-2 w-2 rounded-sm bg-sky-400"/>กิจกรรม</span></div>
        </div>

        <h2 class="mt-7 text-lg font-bold">สารอาหาร 7 วัน</h2>
        <div class="mt-3 space-y-3">
          <article v-for="macro in macroCards" :key="macro.key" class="rounded-3xl bg-white p-5 shadow-sm">
            <div class="flex items-start justify-between"><div><p class="font-bold">{{ macro.label }}</p><p class="text-sm text-slate-500">เฉลี่ย {{ macroAverage(macro.key) }}g/วัน</p></div><p class="text-sm font-semibold" :class="macro.textClass">เป้า {{ targets[macro.key] }}g</p></div>
            <div class="mt-4 flex h-28 items-end gap-2" :aria-label="`กราฟ${macro.label} 7 วันล่าสุด`" role="img"><div v-for="date in lastSevenDays" :key="`${macro.key}-${date}`" class="flex h-full min-w-0 flex-1 flex-col justify-end"><p class="mb-1 truncate text-center text-[9px] text-slate-500">{{ dailyTotals(date)[macro.key] || '-' }}</p><div class="rounded-t-md" :class="macro.barClass" :style="{ height: `${macroChartHeight(date, macro.key)}%`, minHeight: dailyTotals(date)[macro.key] ? '3px' : '0' }"/><p class="mt-1 text-center text-[9px] text-slate-400">{{ shortDate(date).split(' ')[0] }}</p></div></div>
          </article>
        </div>

        <div class="mt-7 flex items-center justify-between"><h2 class="text-lg font-bold">แนวโน้มร่างกาย</h2><button type="button" class="text-sm font-semibold text-teal-700" @click="goTo('body')">จัดการข้อมูล</button></div>
        <p v-if="recentMeasurements.length === 0" class="mt-3 rounded-2xl bg-white p-5 text-center text-slate-500">ยังไม่มีข้อมูลร่างกายสำหรับสร้างกราฟ</p>
        <div v-else class="mt-3 space-y-3">
          <article v-for="metric in bodyFields" :key="metric.key" class="rounded-3xl bg-white p-5 shadow-sm">
            <div class="flex items-start justify-between"><div><p class="font-bold">{{ metric.label }}</p><p class="text-sm text-slate-500">ล่าสุด {{ latestBodyValue(metric.key) ?? '—' }} {{ metric.unit }}</p></div><p class="text-sm font-semibold text-slate-600">เปลี่ยน {{ signed(bodyDelta(metric.key)) }} {{ metric.unit }}</p></div>
            <div class="mt-4 flex h-28 items-end gap-2" :aria-label="`กราฟ${metric.label}`" role="img"><div v-for="item in recentMeasurements" :key="`${metric.key}-${item.id}`" class="flex h-full min-w-0 flex-1 flex-col justify-end"><p class="mb-1 truncate text-center text-[9px] text-slate-500">{{ bodyValue(item, metric.key) ?? '-' }}</p><div class="rounded-t-md bg-slate-500" :style="{ height: `${bodyChartHeight(item, metric.key)}%`, minHeight: bodyValue(item, metric.key) !== undefined ? '3px' : '0' }"/><p class="mt-1 text-center text-[9px] text-slate-400">{{ shortDate(item.date).split(' ')[0] }}</p></div></div>
          </article>
        </div>

        <div class="mt-5 rounded-2xl bg-amber-50 p-4 text-amber-950"><p class="font-semibold">Current streak: {{ currentStreak }} วัน · Best: {{ bestStreak }} วัน</p><p class="mt-1 text-sm">นับว่าสำเร็จเมื่อแคลอรี โปรตีน คาร์บ และไขมันทุกค่าอยู่ในช่วง 90–110% ของเป้าหมาย โดยเป้าแคลอรีรวมกิจกรรมของวันนั้น</p></div>
      </section>

      <section v-else-if="tab === 'body'" class="px-5">
        <h1 class="text-2xl font-bold">สัดส่วนร่างกาย</h1><p class="mt-2 text-slate-600">บันทึกหรือแก้ไขข้อมูลเดิมได้โดยตรง</p>
        <form class="mt-6 space-y-3" @submit.prevent="saveBodyMeasurement">
          <label class="block rounded-2xl bg-white p-4 shadow-sm"><span class="font-medium">วันที่</span><input v-model="bodyForm.date" type="date" class="mt-2 w-full rounded-xl bg-stone-100 px-3 py-2 outline-teal-600"></label>
          <label v-for="item in bodyFields" :key="item.key" class="block rounded-2xl bg-white p-4 shadow-sm"><span class="font-medium">{{ item.label }} ({{ item.unit }})</span><input v-model="bodyForm[item.key]" type="number" min="0" step="0.1" inputmode="decimal" class="mt-2 w-full rounded-xl bg-stone-100 px-3 py-2 outline-teal-600"></label>
          <p v-if="message" class="text-sm" :class="messageClass" role="status">{{ message }}</p>
          <div class="flex gap-3"><button v-if="editingMeasurementId" type="button" class="flex-1 rounded-2xl border border-slate-200 bg-white py-4 font-semibold" @click="resetBodyForm">ยกเลิก</button><button class="flex-1 rounded-2xl bg-teal-700 py-4 font-semibold text-white">{{ editingMeasurementId ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล' }}</button></div>
        </form>
        <h2 class="mt-8 text-lg font-bold">ประวัติ</h2>
        <p v-if="measurements.length === 0" class="mt-3 rounded-2xl bg-white p-4 text-center text-slate-500">ยังไม่มีข้อมูลร่างกาย</p>
        <div v-else class="mt-3 space-y-2"><article v-for="item in measurements" :key="item.id" class="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"><div class="min-w-0 flex-1"><p class="font-semibold">{{ formatHistoryDate(item.date) }}</p><p class="text-sm text-slate-500"><span v-if="item.weight !== undefined">น้ำหนัก {{ item.weight }} kg</span><span v-if="item.bodyFat !== undefined"> · ไขมัน {{ item.bodyFat }}%</span><span v-if="item.muscleMass !== undefined"> · กล้ามเนื้อ {{ item.muscleMass }} kg</span></p></div><div class="flex shrink-0 gap-3"><button type="button" class="text-sm font-medium text-teal-700" @click="editBodyMeasurement(item)">แก้ไข</button><button type="button" class="text-sm font-medium text-red-600" @click="removeBodyMeasurement(item.id)">ลบ</button></div></article></div>
      </section>

      <section v-else-if="tab === 'activity'" class="px-5">
        <div class="flex items-center gap-3"><button type="button" class="touch-button text-2xl" aria-label="กลับหน้าสุขภาพ" @click="resetActivityForm(); goTo('health')">‹</button><h1 class="text-2xl font-bold">กิจกรรม</h1></div>
        <p class="mt-2 text-slate-600">แคลอรีกิจกรรมจะเพิ่มเป้าพลังงานของวันที่เลือก</p>
        <form class="mt-6 space-y-4" @submit.prevent="saveActivity">
          <label class="block"><span class="mb-1 block text-sm font-medium text-slate-700">วันที่</span><input v-model="activityForm.date" type="date" class="w-full rounded-2xl bg-white px-4 py-4 shadow-sm outline-teal-600"></label>
          <label class="block"><span class="mb-1 block text-sm font-medium text-slate-700">กิจกรรม</span><input v-model="activityForm.name" placeholder="เช่น วิ่ง 30 นาที" maxlength="120" class="w-full rounded-2xl bg-white px-4 py-4 shadow-sm outline-teal-600"></label>
          <label class="block"><span class="mb-1 block text-sm font-medium text-slate-700">แคลอรีที่เผาผลาญ</span><input v-model="activityForm.calories" type="number" min="1" step="1" inputmode="numeric" placeholder="เช่น 250" class="w-full rounded-2xl bg-white px-4 py-4 shadow-sm outline-teal-600"></label>
          <p v-if="message" class="text-sm" :class="messageClass" role="status">{{ message }}</p>
          <div class="flex gap-3"><button v-if="editingActivityId" type="button" class="flex-1 rounded-2xl border border-slate-200 bg-white py-4 font-semibold" @click="resetActivityForm">ยกเลิก</button><button class="flex-1 rounded-2xl bg-teal-700 py-4 font-semibold text-white">{{ editingActivityId ? 'บันทึกการแก้ไข' : 'บันทึกกิจกรรม' }}</button></div>
        </form>
        <h2 class="mt-8 text-lg font-bold">กิจกรรมทั้งหมด</h2>
        <p v-if="sortedActivities.length === 0" class="mt-3 rounded-2xl bg-white p-4 text-center text-slate-500">ยังไม่มีกิจกรรมที่บันทึกไว้</p>
        <div v-else class="mt-3 space-y-2"><article v-for="activity in sortedActivities" :key="activity.id" class="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm"><div class="min-w-0 flex-1"><p class="truncate font-semibold">{{ activity.name }}</p><p class="text-sm text-slate-500">{{ formatHistoryDate(activity.date) }} · {{ activity.calories }} kcal</p></div><div class="flex shrink-0 gap-3"><button type="button" class="text-sm font-medium text-teal-700" @click="editActivity(activity)">แก้ไข</button><button type="button" class="text-sm font-medium text-red-600" @click="removeActivity(activity.id)">ลบ</button></div></article></div>
      </section>

      <section v-else-if="tab === 'health'" class="px-5 health-page">
        <div class="page-heading"><div><p class="page-kicker">บันทึกเพิ่มเติม</p><h1>สุขภาพของฉัน</h1></div></div>
        <p class="page-intro">ดูความเปลี่ยนแปลงของร่างกายและกิจกรรมในที่เดียว</p>
        <div class="health-hero"><div><span>น้ำหนักล่าสุด</span><strong>{{ latestBodyValue('weight') ?? '—' }} <small>kg</small></strong><small>ติดตามต่อเนื่องเพื่อเห็นแนวโน้ม</small></div><span class="health-hero-icon">◉</span></div>
        <div class="health-grid"><button type="button" @click="goTo('body')"><span class="health-tile-icon">◉</span><strong>สัดส่วนร่างกาย</strong><small>น้ำหนัก · ไขมัน · กล้ามเนื้อ</small><span class="health-tile-link">ดูและบันทึก →</span></button><button type="button" @click="goTo('activity')"><span class="health-tile-icon">↗</span><strong>กิจกรรม</strong><small>วันนี้เผาผลาญ {{ activityCalories }} kcal</small><span class="health-tile-link">ดูและบันทึก →</span></button></div>
        <div class="section-heading"><div><p class="page-kicker">ทางลัด</p><h2>จัดการข้อมูล</h2></div></div>
        <button type="button" class="health-link" @click="goTo('menus')"><span>▤</span><strong>เมนูอาหารของฉัน</strong><span>→</span></button>
        <button type="button" class="health-link" @click="goTo('settings')"><span>⚙</span><strong>เป้าหมายและตั้งค่า</strong><span>→</span></button>
      </section>

      <section v-else class="px-5">
        <h1 class="text-2xl font-bold">ตั้งค่า</h1><p class="mt-2 text-slate-600">เป้าหมาย แอป และความเป็นส่วนตัว</p>
        <h2 class="mt-6 font-bold">เป้าหมายรายวัน</h2>
        <div class="mt-3 space-y-3"><label v-for="item in targetFields" :key="item.key" class="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm"><span>{{ item.label }} ({{ item.unit }})</span><input v-model.number="targets[item.key]" type="number" min="0" inputmode="decimal" class="w-24 rounded-lg bg-stone-100 px-2 py-2 text-right outline-teal-600" :aria-label="item.label"></label></div>
        <p v-if="message" class="mt-3 text-sm" :class="messageClass" role="status">{{ message }}</p>
        <button type="button" class="mt-4 w-full rounded-2xl bg-teal-700 py-4 font-semibold text-white" @click="saveTargets">บันทึกการตั้งค่า</button>

        <div class="mt-7 rounded-2xl bg-white p-4 shadow-sm"><p class="font-semibold">ติดตั้งเป็นแอป (PWA)</p><p v-if="isInstalled" class="mt-1 text-sm text-teal-700">ติดตั้งบนอุปกรณ์นี้แล้ว</p><template v-else><p class="mt-1 text-sm text-slate-600">ติดตั้งบนหน้าจอหลักเพื่อเปิดแบบเต็มจอและใช้ข้อมูลที่เคยเปิดไว้ได้แม้ออฟไลน์บางส่วน</p><button v-if="canInstall" type="button" class="mt-3 rounded-xl bg-teal-700 px-4 py-2 font-semibold text-white" @click="installApp">ติดตั้งแอป</button><p v-else-if="isIosDevice" class="mt-3 text-sm text-slate-600">บน iPhone/iPad: เปิดเมนู Share แล้วเลือก “Add to Home Screen”</p><p v-else class="mt-3 text-sm text-slate-500">ถ้าเบราว์เซอร์รองรับ ปุ่มติดตั้งจะปรากฏเมื่อเงื่อนไข PWA พร้อม</p></template></div>

        <div class="mt-4 rounded-2xl bg-white p-4 shadow-sm"><p class="font-semibold">ความเป็นส่วนตัว</p><p class="mt-1 text-sm leading-6 text-slate-600">อาหาร กิจกรรม สัดส่วน เป้าหมาย และโปรไฟล์ที่ใช้ในแอปเก็บใน Local Storage ของเบราว์เซอร์นี้ ข้อความอาหารจะถูกส่งไปประเมินด้วย AI เมื่อคุณกดประเมิน และรูปฉลากจะถูกส่งไปยัง Typhoon OCR เมื่อคุณกดอ่านฉลาก โดยไม่บันทึกรูปไว้ในข้อมูลแอป</p></div>

        <div class="mt-4 rounded-2xl border border-red-100 bg-red-50 p-4"><p class="font-semibold text-red-800">ลบบัญชีและข้อมูลทั้งหมด</p><p class="mt-1 text-sm text-red-700">ลบข้อมูลทุก key ของแอปที่ขึ้นต้นด้วย <code>kalgueng:</code> จาก Local Storage รวมถึงข้อมูลเข้าสู่ระบบบนอุปกรณ์นี้</p><button type="button" class="mt-3 rounded-xl bg-red-600 px-4 py-2 font-semibold text-white" @click="deleteAccountAndData">ลบบัญชีและข้อมูล</button></div>
        <button type="button" class="mt-3 w-full rounded-2xl py-3 font-medium text-red-600" @click="logout">ออกจากระบบ</button>
      </section>

      <nav class="safe-nav app-nav fixed bottom-0 left-1/2 z-20 flex w-full max-w-lg -translate-x-1/2 justify-around bg-white/95 px-2 pt-2 backdrop-blur" aria-label="เมนูหลัก">
        <button type="button" class="nav-button" :class="tab === 'today' ? 'is-active' : ''" :aria-current="tab === 'today' ? 'page' : undefined" @click="goTo('today')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></svg><span>วันนี้</span></button>
        <button type="button" class="nav-button" :class="tab === 'history' ? 'is-active' : ''" :aria-current="tab === 'history' ? 'page' : undefined" @click="goTo('history')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M7 2v4M17 2v4M3 9h18M8 14h3M8 17h6"/></svg><span>ประวัติ</span></button>
        <button type="button" class="nav-add" :class="['add', 'scan', 'menus'].includes(tab) ? 'is-active' : ''" aria-label="เพิ่มอาหาร" @click="openFoodForm"><span>＋</span><small>เพิ่ม</small></button>
        <button type="button" class="nav-button" :class="tab === 'stats' ? 'is-active' : ''" :aria-current="tab === 'stats' ? 'page' : undefined" @click="goTo('stats')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10h4v10M10 20V4h4v16M16 20v-7h4v7M2 20h20"/></svg><span>สถิติ</span></button>
        <button type="button" class="nav-button" :class="['health', 'body', 'activity', 'settings'].includes(tab) ? 'is-active' : ''" :aria-current="tab === 'health' ? 'page' : undefined" @click="goTo('health')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 9c0 5-8 11-8 11S4 14 4 9a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9Z"/><path d="M7 11h3l1.3-2.5L13 14l1.2-3H17"/></svg><span>สุขภาพ</span></button>
      </nav>
    </template>
  </main>
</template>
