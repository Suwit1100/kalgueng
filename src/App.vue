<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { signInWithGoogle } from './lib/google'
import { store } from './lib/storage'
import type { ActivityLog, FoodLog, Macro, Targets, User } from './types'

const user = ref<User | null>(store.getUser())
const tab = ref<'today' | 'add' | 'activity' | 'settings'>('today')
const isOnboarding = ref(user.value !== null && !store.hasTargets())
const targets = ref<Targets>(store.getTargets())
const foods = ref<FoodLog[]>(store.getFoods())
const activities = ref<ActivityLog[]>(store.getActivities())
const error = ref('')
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())
const form = ref({ name: '', meal: 'lunch' as FoodLog['meal'], calories: '', protein: '', carbs: '', fat: '' })
const editingFoodId = ref<string | null>(null)
const activityForm = ref({ name: '', calories: '' })

const totals = computed<Macro>(() => foods.value.filter((food) => food.date === today).reduce((sum, food) => ({
  calories: sum.calories + food.calories, protein: sum.protein + food.protein, carbs: sum.carbs + food.carbs, fat: sum.fat + food.fat,
}), { calories: 0, protein: 0, carbs: 0, fat: 0 }))
const activityCalories = computed(() => activities.value.filter((activity) => activity.date === today).reduce((sum, activity) => sum + activity.calories, 0))
const adjustedCalories = computed(() => targets.value.calories + activityCalories.value)
const remaining = computed<Macro>(() => ({
  calories: adjustedCalories.value - totals.value.calories, protein: targets.value.protein - totals.value.protein,
  carbs: targets.value.carbs - totals.value.carbs, fat: targets.value.fat - totals.value.fat,
}))
const dateText = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

function loadGoogleScript() {
  if (document.querySelector('#google-identity')) return
  const script = document.createElement('script')
  script.id = 'google-identity'; script.src = 'https://accounts.google.com/gsi/client'; script.async = true
  document.head.appendChild(script)
}
function login() {
  error.value = ''
  try { signInWithGoogle((profile) => { user.value = profile; store.setUser(profile); isOnboarding.value = !store.hasTargets() }) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : 'เข้าสู่ระบบไม่สำเร็จ' }
}
function saveTargets() { store.setTargets(targets.value); isOnboarding.value = false; tab.value = 'today' }
function saveFood() {
  const value = form.value
  if (!value.name.trim()) { error.value = 'กรุณาระบุชื่ออาหาร'; return }
  const food: FoodLog = { id: editingFoodId.value ?? crypto.randomUUID(), name: value.name.trim(), meal: value.meal, date: today, createdAt: new Date().toISOString(), calories: Number(value.calories) || 0, protein: Number(value.protein) || 0, carbs: Number(value.carbs) || 0, fat: Number(value.fat) || 0 }
  if (editingFoodId.value) {
    const original = foods.value.find((item) => item.id === editingFoodId.value)
    food.createdAt = original?.createdAt ?? food.createdAt
    store.updateFood(food)
  } else store.saveFood(food)
  foods.value = store.getFoods(); resetFoodForm(); tab.value = 'today'
}
function resetFoodForm() { form.value = { name: '', meal: 'lunch', calories: '', protein: '', carbs: '', fat: '' }; editingFoodId.value = null; error.value = '' }
function editFood(food: FoodLog) { editingFoodId.value = food.id; form.value = { name: food.name, meal: food.meal, calories: String(food.calories), protein: String(food.protein), carbs: String(food.carbs), fat: String(food.fat) }; error.value = ''; tab.value = 'add' }
function removeFood(id: string) { store.deleteFood(id); foods.value = store.getFoods() }
function saveActivity() {
  if (!activityForm.value.name.trim() || Number(activityForm.value.calories) <= 0) { error.value = 'Please enter an activity and calories burned'; return }
  store.saveActivity({ id: crypto.randomUUID(), name: activityForm.value.name.trim(), calories: Number(activityForm.value.calories), date: today, createdAt: new Date().toISOString() })
  activities.value = store.getActivities(); activityForm.value = { name: '', calories: '' }; error.value = ''; tab.value = 'today'
}
function removeActivity(id: string) { store.deleteActivity(id); activities.value = store.getActivities() }
function logout() { store.clearUser(); user.value = null; tab.value = 'today' }
onMounted(loadGoogleScript)
</script>

<template>
  <main class="mx-auto min-h-screen max-w-md bg-stone-50 pb-24">
    <section v-if="!user" class="flex min-h-screen flex-col justify-center px-6 text-center">
      <div class="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-3xl bg-teal-700 text-4xl shadow-lg">🥗</div>
      <h1 class="text-3xl font-bold tracking-tight">แคลกูเอง</h1>
      <p class="mt-3 text-slate-600">บันทึกอาหารง่าย ๆ<br>รู้ทันทีว่าวันนี้เหลือกินได้เท่าไร</p>
      <button class="mt-10 rounded-2xl bg-teal-700 px-5 py-4 font-semibold text-white shadow-sm active:bg-teal-800" @click="login">ดำเนินการต่อด้วย Google</button>
      <p v-if="error" class="mt-4 text-sm text-red-600">{{ error }}<br><span class="text-slate-500">คัดลอก <code>.env.example</code> เป็น <code>.env.local</code> แล้วระบุ Google Client ID</span></p>
    </section>

    <section v-else-if="isOnboarding" class="px-5 py-10">
      <p class="text-sm font-medium text-teal-700">เริ่มต้นใช้งาน</p><h1 class="mt-1 text-3xl font-bold">เป้าหมายของคุณ</h1>
      <p class="mt-2 text-slate-600">ตั้งเป้ารายวันก่อนเริ่มบันทึกอาหาร แก้ไขภายหลังได้เสมอ</p>
      <div class="mt-8 space-y-4">
        <label v-for="item in [{key:'calories',label:'พลังงาน',unit:'kcal'}, {key:'protein',label:'โปรตีน',unit:'g'}, {key:'carbs',label:'คาร์โบไฮเดรต',unit:'g'}, {key:'fat',label:'ไขมัน',unit:'g'}]" :key="item.key" class="block rounded-2xl bg-white p-4 shadow-sm">
          <span class="font-semibold">{{ item.label }}</span><div class="mt-2 flex items-center gap-2"><input v-model.number="targets[item.key as keyof Targets]" min="0" type="number" class="w-full rounded-xl bg-stone-100 px-3 py-2 outline-teal-600"><span class="w-10 text-sm text-slate-500">{{ item.unit }}</span></div>
        </label>
      </div>
      <button class="mt-6 w-full rounded-2xl bg-teal-700 py-4 font-semibold text-white" @click="saveTargets">บันทึกเป้าหมาย</button>
    </section>

    <template v-else>
      <header class="flex items-center justify-between px-5 pb-5 pt-7"><div><p class="text-sm text-slate-500">{{ dateText }}</p><h1 class="text-2xl font-bold">สวัสดี {{ user.name.split(' ')[0] }}</h1></div><img v-if="user.picture" :src="user.picture" class="h-10 w-10 rounded-full" :alt="user.name"></header>
      <div v-if="tab === 'today'" class="px-5"><button class="w-full rounded-2xl border border-teal-100 bg-teal-50 px-4 py-3 text-left text-sm font-semibold text-teal-800" @click="tab = 'activity'">+ Add activity · {{ activityCalories }} kcal burned today</button></div>
      <section v-if="tab === 'today'" class="px-5">
        <div class="rounded-3xl bg-teal-700 p-6 text-white shadow-lg"><p class="font-medium text-teal-100">วันนี้กินไปแล้ว</p><p class="mt-2 text-4xl font-bold">{{ totals.calories.toLocaleString() }} <span class="text-lg font-medium">/ {{ targets.calories.toLocaleString() }} kcal</span></p><p class="mt-6 text-teal-100">เหลือกินได้</p><p class="text-2xl font-bold">{{ Math.max(0, remaining.calories).toLocaleString() }} kcal</p></div>
        <h2 class="mt-7 text-lg font-bold">สารอาหาร</h2><div class="mt-3 grid grid-cols-3 gap-3"><div v-for="macro in [{label:'โปรตีน', key:'protein', color:'bg-sky-500'}, {label:'คาร์บ', key:'carbs', color:'bg-amber-500'}, {label:'ไขมัน', key:'fat', color:'bg-rose-500'}]" :key="macro.key" class="rounded-2xl bg-white p-3 shadow-sm"><p class="text-xs text-slate-500">{{ macro.label }}</p><p class="mt-1 font-bold">{{ totals[macro.key as keyof Macro] }}<span class="text-xs font-normal"> / {{ targets[macro.key as keyof Macro] }}g</span></p><div class="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-200"><div :class="macro.color" class="h-full" :style="{ width: `${Math.min(100, totals[macro.key as keyof Macro] / targets[macro.key as keyof Macro] * 100)}%` }" /></div></div></div>
        <div class="mt-7 flex items-center justify-between"><h2 class="text-lg font-bold">อาหารวันนี้</h2><button class="text-sm font-semibold text-teal-700" @click="tab = 'add'">+ เพิ่มอาหาร</button></div>
        <p v-if="foods.filter(f => f.date === today).length === 0" class="mt-3 rounded-2xl bg-white p-5 text-center text-slate-500">ยังไม่มีรายการอาหารวันนี้</p>
        <div v-else class="mt-3 space-y-2"><article v-for="food in foods.filter(f => f.date === today)" :key="food.id" class="flex items-center rounded-2xl bg-white p-4 shadow-sm"><div class="flex-1"><p class="font-semibold">{{ food.name }}</p><p class="text-sm text-slate-500">{{ { breakfast: 'เช้า', lunch: 'กลางวัน', dinner: 'เย็น', snack: 'ของว่าง' }[food.meal] }} · P {{ food.protein }}g · C {{ food.carbs }}g · F {{ food.fat }}g</p></div><div class="text-right"><p class="font-bold">{{ food.calories }} kcal</p><button class="mt-1 text-xs text-red-500" @click="removeFood(food.id)">ลบ</button></div></article></div>
      </section>
      <section v-else-if="tab === 'add'" class="px-5"><div class="flex items-center gap-3"><button class="text-2xl" @click="tab = 'today'">‹</button><h1 class="text-2xl font-bold">เพิ่มอาหาร</h1></div><p class="mt-2 text-slate-600">กรอกข้อมูลโภชนาการที่ทราบได้ทันที</p><form class="mt-6 space-y-4" @submit.prevent="saveFood"><input v-model="form.name" placeholder="เช่น กะเพราไก่ไข่ดาว 1 จาน" class="w-full rounded-2xl border-0 bg-white px-4 py-4 shadow-sm outline-teal-600"><select v-model="form.meal" class="w-full rounded-2xl bg-white px-4 py-4 shadow-sm outline-teal-600"><option value="breakfast">อาหารเช้า</option><option value="lunch">อาหารกลางวัน</option><option value="dinner">อาหารเย็น</option><option value="snack">ของว่าง</option></select><div class="grid grid-cols-2 gap-3"><label v-for="item in [{key:'calories',label:'พลังงาน (kcal)'}, {key:'protein',label:'โปรตีน (g)'}, {key:'carbs',label:'คาร์บ (g)'}, {key:'fat',label:'ไขมัน (g)'}]" :key="item.key"><span class="mb-1 block text-sm text-slate-600">{{ item.label }}</span><input v-model="form[item.key as keyof typeof form]" type="number" min="0" inputmode="decimal" class="w-full rounded-xl bg-white px-3 py-3 shadow-sm outline-teal-600"></label></div><p v-if="error" class="text-sm text-red-600">{{ error }}</p><button class="w-full rounded-2xl bg-teal-700 py-4 font-semibold text-white">บันทึกอาหาร</button></form></section>
      <section v-else-if="tab === 'activity'" class="px-5">
        <div class="flex items-center gap-3"><button class="text-2xl" @click="tab = 'today'">‹</button><h1 class="text-2xl font-bold">Activity</h1></div>
        <p class="mt-2 text-slate-600">Activity calories increase only today's calorie budget.</p>
        <form class="mt-6 space-y-4" @submit.prevent="saveActivity"><input v-model="activityForm.name" placeholder="e.g. Running 30 minutes" class="w-full rounded-2xl bg-white px-4 py-4 shadow-sm outline-teal-600"><input v-model="activityForm.calories" type="number" min="1" inputmode="numeric" placeholder="Calories burned" class="w-full rounded-2xl bg-white px-4 py-4 shadow-sm outline-teal-600"><p v-if="error" class="text-sm text-red-600">{{ error }}</p><button class="w-full rounded-2xl bg-teal-700 py-4 font-semibold text-white">Save activity</button></form>
        <h2 class="mt-8 text-lg font-bold">Today's activities</h2><p v-if="activities.filter(activity => activity.date === today).length === 0" class="mt-3 rounded-2xl bg-white p-4 text-center text-slate-500">No activity logged today</p><div v-else class="mt-3 space-y-2"><article v-for="activity in activities.filter(activity => activity.date === today)" :key="activity.id" class="flex items-center rounded-2xl bg-white p-4 shadow-sm"><div class="flex-1"><p class="font-semibold">{{ activity.name }}</p><p class="text-sm text-teal-700">+{{ activity.calories }} kcal budget</p></div><button class="text-sm text-red-500" @click="removeActivity(activity.id)">Delete</button></article></div>
      </section>
      <section v-else class="px-5"><h1 class="text-2xl font-bold">ตั้งค่า</h1><p class="mt-2 text-slate-600">เป้าหมายรายวันของคุณ</p><div class="mt-5 space-y-3"><label v-for="item in [{key:'calories',label:'พลังงาน (kcal)'}, {key:'protein',label:'โปรตีน (g)'}, {key:'carbs',label:'คาร์บ (g)'}, {key:'fat',label:'ไขมัน (g)'}]" :key="item.key" class="flex items-center justify-between rounded-2xl bg-white p-4 shadow-sm"><span>{{ item.label }}</span><input v-model.number="targets[item.key as keyof Targets]" type="number" min="0" class="w-24 rounded-lg bg-stone-100 px-2 py-1 text-right outline-teal-600"></label></div><button class="mt-5 w-full rounded-2xl bg-teal-700 py-4 font-semibold text-white" @click="saveTargets">บันทึกการตั้งค่า</button><button class="mt-3 w-full rounded-2xl py-3 text-red-600" @click="logout">ออกจากระบบ</button></section>
      <nav class="fixed bottom-0 left-1/2 flex w-full max-w-md -translate-x-1/2 justify-around border-t bg-white px-4 py-3"><button :class="tab === 'today' ? 'text-teal-700' : 'text-slate-500'" @click="tab = 'today'">⌂<span class="block text-xs">วันนี้</span></button><button class="-mt-8 grid h-14 w-14 place-items-center rounded-full bg-teal-700 text-3xl text-white shadow-lg" @click="tab = 'add'">+</button><button :class="tab === 'settings' ? 'text-teal-700' : 'text-slate-500'" @click="tab = 'settings'">⚙<span class="block text-xs">ตั้งค่า</span></button></nav>
    </template>
  </main>
</template>
