const SUPABASE_URL = "https://kwsatixuftemxlhluzjc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_1xUoMevCXVbJeF5S3Q2D_w_ouZ2eJRJ";

const NAMES = ["Davor","Claudia","Anna-Marie","Nicolina","Alexander","Dominik"];
const DEVICE_LOCK_KEY = "weihnachtslotterie-2-2026-device-round";
const el = id => document.getElementById(id);
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let state = {
  selected: null,
  drawnCount: 0,
  roundVersion: null,
  deviceLocked: false
};

function toast(message){
  const t = el("toast");
  t.textContent = message;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}

function render(){
  el("participants").innerHTML = "";

  NAMES.forEach(name => {
    const button = document.createElement("button");
    button.className = "participant" + (state.selected === name ? " selected" : "");
    button.textContent = name;
    button.disabled = state.deviceLocked;
    button.onclick = () => {
      if(state.deviceLocked) return;
      state.selected = name;
      render();
    };
    el("participants").appendChild(button);
  });

  el("selectionPanel").hidden = !state.selected || state.deviceLocked;
  el("lockedPanel").hidden = !state.deviceLocked;
  el("selectedName").textContent = state.selected || "—";
  el("drawnCount").textContent = state.drawnCount;
}

function syncDeviceLock(){
  const storedRound = Number(localStorage.getItem(DEVICE_LOCK_KEY));
  state.deviceLocked = Number.isInteger(storedRound) && storedRound === state.roundVersion;

  if(storedRound && storedRound !== state.roundVersion){
    localStorage.removeItem(DEVICE_LOCK_KEY);
  }
}

async function refreshCount(){
  const { data, error } = await db.rpc("lottery2_status");

  if(error){
    console.error(error);
    toast("Status konnte nicht geladen werden.");
    return;
  }

  state.drawnCount = Number(data?.[0]?.drawn_count ?? 0);
  state.roundVersion = Number(data?.[0]?.round_version ?? 1);
  syncDeviceLock();
  render();
}

async function draw(){
  if(!state.selected || state.deviceLocked) return;

  const button = el("drawButton");
  button.disabled = true;
  button.innerHTML = "✨ Los wird gezogen …";
  await new Promise(resolve => setTimeout(resolve, 900));

  const { data, error } = await db.rpc("lottery2_draw", {
    p_giver: state.selected
  });

  button.disabled = false;
  button.innerHTML = '<span class="button-icon">🎟️</span>Los ziehen';

  if(error){
    console.error(error);
    toast(String(error.message || "").includes("bereits gezogen")
      ? "Diese Person hat bereits gezogen."
      : (error.message || "Ziehung fehlgeschlagen."));
    await refreshCount();
    return;
  }

  localStorage.setItem(DEVICE_LOCK_KEY, String(state.roundVersion));
  state.deviceLocked = true;

  el("recipientName").textContent = data;
  el("lotteryCard").hidden = true;
  el("resultCard").hidden = false;

  await refreshCount();
  window.scrollTo({ top: el("resultCard").offsetTop - 20, behavior: "smooth" });
}

el("drawButton").addEventListener("click", draw);

el("closeResult").addEventListener("click", () => {
  el("resultCard").hidden = true;
  el("lotteryCard").hidden = false;
  state.selected = null;
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

render();
refreshCount();