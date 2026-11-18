import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { startGesprek, stopGesprek } from "./gesprek.js";

const sb = createClient("https://ofzyqwpztohflxdhqgbb.supabase.co", "sb_publishable_x8nU8ype6b1KOL6K8lS2Iw_DDjz4Olr");
const API = "https://systeem.boaportaal.nl/.netlify/functions/overleg";
const app = document.getElementById("app");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&" + "amp;", "<": "&" + "lt;", ">": "&" + "gt;", '"': "&" + "quot;", "'": "&" + "#39;" }[c]));

const STEMS = [
  ["akkoord", "✅ Gecontroleerd & akkoord"],
  ["oppakken", "🛠️ Ik pak dit op"],
  ["meekijken", "👀 Even meekijken"],
  ["juridisch", "⚠️ Juridische aanpassing nodig"],
];
const STATUSSEN = [
  ["aanwezig", "🟢 Aanwezig / beschikbaar voor overleg"],
  ["redactie", "💻 Bezig met bouwen / redactie"],
  ["dienst", "🎧 In servicedesk-dienst"],
  ["straat", "🚓 Op straat / eigen dienst"],
  ["afwezig", "⚫ Afwezig"],
];
const STIP = { aanwezig: "#15803d", redactie: "#1d4ed8", dienst: "#9a5b12", straat: "#b45309", afwezig: "#57534e" };

let ik = null;
let fout = "";
let kanalen = [];
let kanaal = "algemeen";
let tab = "gesprekken";
let onderwerpen = [];
let berichten = [];
let stempels = [];
let taken = [];
let openId = "";
let concept = "";
let titelConcept = "";
let labelConcept = "TER CONTROLE";
let paneel = "";
let meedoen = false;
let callVideo = true;
let team = [];
let aanwezig = {};
let bezig = false;
let opnieuw = false;
let live = null;
let kamer = null;
let modus = "kanaal";
let dmId = "";
let dms = [];
let dmBerichten = [];
let conceptDm = "";
let reacties = {};
let getekend = "";
let wacht = 0;
let afspraken = [];
let afspraakOpen = "";
let afspraakConcept = { titel: "", start: "", einde: "", omschrijving: "", deelnemers: [] };

function tijd(waarde) {
  return new Date(waarde).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function kaartVan(clientId) {
  return team.find((rij) => rij.client_id === clientId) || {};
}

function zichtbareNaam(ruw) {
  const t = String(ruw || "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  const mooi = (woord) => {
    const s = String(woord || "").replace(/\./g, "");
    return s ? s.slice(0, 1).toUpperCase() + s.slice(1).toLowerCase() : "";
  };
  const initialen = (tekst) => String(tekst || "").split(/\s+/).filter(Boolean).map((woord) => woord.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase()).filter(Boolean);
  if (t.includes(",")) {
    const [links, rechts] = t.split(",", 2);
    const linksT = links.trim();
    const rechtsT = (rechts || "").trim();
    const delen = rechtsT.split(/\s+/).filter(Boolean);
    const alleen = delen.length > 0 && delen.every((woord) => /^[A-Za-z]\.?$/.test(woord));
    if (!/[A-Za-z]/.test(rechtsT)) return mooi(linksT);
    if (alleen) {
      const inits = delen.map((woord) => woord.replace(/\./g, "").slice(0, 1).toUpperCase());
      if (linksT === linksT.toUpperCase()) return `${inits[0]}., ${initialen(linksT).join(" ")}.`;
      return `${mooi(linksT)}, ${inits.join(" ")}.`;
    }
    const letters = initialen(linksT);
    return letters.length ? `${mooi(rechtsT)}, ${letters.join(" ")}.` : mooi(rechtsT);
  }
  const parts = t.split(/\s+/).filter(Boolean);
  const rest = initialen(parts.slice(1).join(" "));
  return rest.length ? `${mooi(parts[0])}, ${rest.join(" ")}.` : mooi(parts[0]);
}

function publiekeNaam(clientId) {
  const id = clientId || ik?.client_id || "";
  const kaart = kaartVan(id);
  const naam = zichtbareNaam(kaart.naam || kaart.pv_naam || "");
  return naam || id;
}

function postbusVan(clientId) {
  const local = String(kaartVan(clientId).postbus || "").trim().toLowerCase();
  return local ? `${local}@boaportaal.nl` : "";
}
function rolVan(persoon) {
  if (persoon.aanduiding) return persoon.aanduiding;
  const rol = kaartVan(persoon.client_id).rol || persoon.rol;
  return rol === "beheerder" ? "Beheerder" : "Support";
}

function mensen() {
  const lijst = [];
  for (const groep of Object.values(aanwezig)) {
    for (const persoon of groep) lijst.push(persoon);
  }
  const gezien = new Set();
  return lijst.filter((persoon) => {
    if (!persoon.client_id || gezien.has(persoon.client_id)) return false;
    gezien.add(persoon.client_id);
    return true;
  });
}

async function api(body) {
  const token = (await sb.auth.getSession()).data.session?.access_token || "";
  const res = await fetch(API, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const uit = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(uit.fout || "Het verzoek is niet gelukt.");
  return uit;
}

function mensenHtmlLijst() {
  const lijst = mensen();
  return lijst.map((persoon) => {
    const naam = zichtbareNaam(kaartVan(persoon.client_id).naam || "");
    const postbus = postbusVan(persoon.client_id);
    return `<article class="persoon"><div><span class="stip" style="background:${STIP[persoon.status] || STIP.aanwezig}"></span>${naam ? `<b>${esc(naam)}</b>` : `<b class="mono">${esc(persoon.client_id)}</b>`}</div><small>[${esc(rolVan(persoon))}]${naam ? ` · <span class="mono">${esc(persoon.client_id)}</span>` : ""}</small>${postbus ? `<br><small>${esc(postbus)}</small>` : ""}${persoon.client_id === ik.client_id ? "" : `<div><button class="sec" type="button" data-dm="${esc(persoon.client_id)}">1 op 1</button></div>`}<div class="zacht">${esc(STATUSSEN.find(([id]) => id === persoon.status)?.[1] || "Aanwezig")}</div></article>`;
  }).join("") || `<p class="zacht">Nog niemand anders online.</p>`;
}

function mensenHtml() {
  return `<h2 style="font-size:18px;margin:4px 0 8px">Team</h2>
    <label>Status<select id="status">${STATUSSEN.map(([id, label]) => `<option value="${id}" ${ik.status === id ? "selected" : ""}>${label}</option>`).join("")}</select></label>
    <label>Rol die collega's zien<input id="aanduiding" value="${esc(ik.aanduiding || "")}" placeholder="Vakredacteur Domein II"></label>
    <div id="lijst">${mensenHtmlLijst()}</div>`;
}

function kaartHtml(kaart) {
  if (!kaart) return "";
  if (kaart.type === "ticket") {
    return `<div class="ticketkaart"><b>${esc(kaart.nummer)}</b><div>${esc(kaart.status || "")}</div><div>Client-ID ${esc(kaart.client_id)} · ${esc(kaart.pv_naam)}</div></div>`;
  }
  if (kaart.type === "voorstel") {
    const open = taken.some((rij) => rij.id === kaart.id && rij.status === "wacht");
    return `<div class="voorstelkaart"><b>${esc(kaart.titel)}</b><div>${kaart.soort === "boom" ? "Beslisboom" : "Feitcode"} · ${esc(kaart.sleutel)}</div>${open && ik.rol === "beheerder" ? `<button class="primair" data-keur="${esc(kaart.id)}" type="button">Goedkeuren en op boaportaal.nl zetten</button>` : `<div class="zacht">${open ? "Wacht op de hoofdbeheerder." : "Al beoordeeld."}</div>`}</div>`;
  }
  return "";
}

function anderVan(dm) {
  return dm.a === ik.client_id ? dm.b : dm.a;
}

function dmLijstHtml() {
  const knoppen = dms.map((dm) => `<button class="kanaal ${modus === "dm" && dm.id === dmId ? "aan" : ""}" type="button" data-dm="${esc(anderVan(dm))}"><b>${esc(publiekeNaam(anderVan(dm)))}</b><small style="display:block">1 op 1</small></button>`).join("");
  return knoppen || `<p class="zacht">Klik bij een collega op 1 op 1.</p>`;
}

function draadHtml(onderwerp) {
  const reeks = berichten.filter((rij) => rij.onderwerp_id === onderwerp.id);
  const open = openId === onderwerp.id;
  const eerste = reeks[0];
  return `<article class="draad ${open ? "" : "dicht"}" data-open="${esc(onderwerp.id)}">
    <div class="rij"><span class="label">${esc(onderwerp.label || "OVERLEG")}</span><b>${esc(onderwerp.titel)}</b></div>
    <small>${esc(publiekeNaam(onderwerp.maker_id))} · <span class="mono">${esc(onderwerp.maker_id)}</span> · ${tijd(onderwerp.created_at)} · ${reeks.length} ${reeks.length === 1 ? "bericht" : "berichten"}</small>
    ${open ? reeks.map((bericht) => `<div class="bericht"><b>${esc(publiekeNaam(bericht.maker_id))}</b> <small class="mono">${esc(bericht.maker_id)} · ${tijd(bericht.created_at)}</small><div>${esc(bericht.tekst)}</div>${kaartHtml(bericht.kaart)}<div class="rij" style="margin-top:6px">${STEMS.map(([code, label]) => {
      const van = stempels.filter((stem) => stem.bericht_id === bericht.id && stem.stempel === code);
      const eigen = van.some((stem) => stem.client_id === ik.client_id);
      return `<button class="stem ${eigen ? "aan" : ""}" type="button" data-stem="${esc(bericht.id)}" data-code="${code}">${label}${van.length ? ` ${van.length}` : ""}</button>`;
    }).join("")}</div></div>`).join("") + `<label style="margin-top:8px">Reageren<textarea data-reactie="${esc(onderwerp.id)}">${esc(reacties[onderwerp.id] || "")}</textarea></label><button class="primair" type="button" data-reageer="${esc(onderwerp.id)}">Reageren</button>` : eerste ? `<p>${esc(eerste.tekst)}</p>` : ""}
  </article>`;
}

function teken() {
  if (!ik) {
    app.innerHTML = `<header class="balk"><a class="merk" href="https://boaportaal.nl"><img src="/boa-mark.png" alt=""><span>BOA Portaal</span></a><span class="hier">Overleg</span><div class="spatie"><button class="licht" id="nacht" type="button">${document.documentElement.classList.contains("night") ? "Dag" : "Nachtdienst"}</button></div></header>
      <main class="poort"><p class="kicker">ALLEEN VOOR MEDEWERKERS</p><h1>Overleg</h1><p class="sub">Hier stemt het team af. Een medewerker komt hier vanzelf in, met hetzelfde e-mailadres als op boaportaal.nl.</p>
      <form id="in" class="kaart"><label>E-mailadres<input name="email" type="email" required autocomplete="username"></label><label>Wachtwoord<input name="password" type="password" required autocomplete="current-password"></label><button class="primair">Inloggen</button>${fout ? `<p class="fout">${esc(fout)}</p>` : ""}</form></main>`;
    document.getElementById("in").onsubmit = aanmelden;
    document.getElementById("nacht").onclick = wisselNacht;
    return;
  }
  if (!ik.medewerker) {
    app.innerHTML = `<header class="balk"><a class="merk" href="https://boaportaal.nl"><img src="/boa-mark.png" alt=""><span>BOA Portaal</span></a><span class="hier">Overleg</span><div class="spatie"><button class="licht" id="nacht" type="button">${document.documentElement.classList.contains("night") ? "Dag" : "Nachtdienst"}</button><button class="licht" id="uit" type="button">Afmelden</button></div></header>
      <main class="poort"><h1>Geen toegang</h1><p class="sub">${esc(ik.email)} is geen medewerker. Log in met het adres dat in systeem bij Accounts staat, niet met een ander adres van dezelfde persoon.</p></main>`;
    document.getElementById("uit").onclick = afmelden;
    document.getElementById("nacht").onclick = wisselNacht;
    return;
  }
  const huidig = kanalen.find((rij) => rij.id === kanaal) || { naam: "Overleg", omschrijving: "", call_room: "" };
  const dmNu = modus === "dm" ? dms.find((dm) => dm.id === dmId) : null;
  const titel = dmNu ? publiekeNaam(anderVan(dmNu)) : huidig.naam;
  const uitleg = dmNu ? "1 op 1. Alleen jullie twee zien dit." : huidig.omschrijving;
  const online = mensen();
  const beschikbaar = online.filter((persoon) => persoon.status !== "afwezig").length;
  const sleutel = `${modus}|${kanaal}|${dmId}|${tab}|${meedoen}|${paneel}|${huidig.call_room}|${document.documentElement.classList.contains("night")}`;
  if (sleutel === getekend && document.getElementById("stroom")) {
    const stroom = document.getElementById("stroom");
    const onderaan = stroom.scrollHeight - stroom.scrollTop - stroom.clientHeight < 48;
    const plek = stroom.scrollTop;
    document.querySelectorAll("[data-reactie]").forEach((veld) => { reacties[veld.dataset.reactie] = veld.value; });
    stroom.innerHTML = `${fout ? `<p class="fout">${esc(fout)}</p>` : ""}${inhoud()}`;
    stroom.scrollTop = onderaan ? stroom.scrollHeight : plek;
    const dmvak = document.getElementById("dms");
    if (dmvak) dmvak.innerHTML = dmLijstHtml();
    bindLicht();
    return;
  }
  getekend = sleutel;
  app.innerHTML = `<header class="balk"><a class="merk" href="https://boaportaal.nl"><img src="/boa-mark.png" alt=""><span>BOA Portaal</span></a><span class="hier">Overleg</span><div class="spatie"><button class="licht" id="nacht" type="button">${document.documentElement.classList.contains("night") ? "Dag" : "Nachtdienst"}</button><a class="tekst" href="https://boaportaal.nl">Portaal</a><button class="licht" id="uit" type="button">Afmelden <span class="mono">${esc(ik.client_id)}</span></button></div></header>
    <div class="werk ${!dmNu && meedoen ? "bellen" : ""}">
      <aside class="kolom kanalen"><p class="zacht">Kanalen</p>${kanalen.map((rij) => `<button class="kanaal ${modus === "kanaal" && rij.id === kanaal ? "aan" : ""}" type="button" data-kanaal="${esc(rij.id)}"><b>${esc(rij.naam)}</b><small style="display:block">${esc(rij.omschrijving)}</small></button>`).join("")}<p class="zacht" style="margin-top:14px">1 op 1</p><div id="dms">${dmLijstHtml()}</div></aside>
      <section class="midden">
        <div class="kop"><div class="koprij"><div><h2>${esc(titel)}</h2><p class="sub" style="margin:4px 0 0">${esc(uitleg)}</p><span id="online">${beschikbaar} beschikbaar</span></div>
          ${dmNu ? "" : `<div class="rij"><button class="sec" id="audio" type="button">Start team-call (audio)</button><button class="primair" id="video" type="button">Start video-meeting en schermdelen</button></div>`}</div></div>
        ${dmNu ? "" : `<div class="tabs"><button class="${tab === "gesprekken" ? "aan" : ""}" data-tab="gesprekken" type="button">Gesprekken</button><button class="${tab === "taken" ? "aan" : ""}" data-tab="taken" type="button">Taken en goedkeuringen</button><button class="${tab === "tickets" ? "aan" : ""}" data-tab="tickets" type="button">Gekoppelde servicedesk-tickets</button><button class="${tab === "agenda" ? "aan" : ""}" data-tab="agenda" type="button">Agenda</button></div>`}
        ${!dmNu && huidig.call_room && !meedoen ? `<div class="call"><span>Vergadering bezig in dit kanaal${huidig.call_door ? ` · gestart door ${esc(huidig.call_door)}` : ""}</span><span class="rij"><button id="mee" type="button">Nu deelnemen</button><button id="sluit" type="button">Voor iedereen sluiten</button></span></div>` : ""}
        ${!dmNu && meedoen && huidig.call_room ? `<div class="hostbalk"><button class="sec" id="weg" type="button">Verlaten</button><button class="sec" id="sluit" type="button">Voor iedereen sluiten</button><button class="primair" id="deel" type="button">Kopieer link voor de klant</button><span class="zacht">Eigen vergadering. Jij bent meteen binnen. De klant wacht tot jij gestart bent.</span></div><div id="gesprek"></div>` : ""}
        <div class="stroom">${fout ? `<p class="fout">${esc(fout)}</p>` : ""}${inhoud()}</div>
        ${dmNu ? `<form class="composer" id="dm-form"><label>Bericht<textarea id="dm-tekst">${esc(conceptDm)}</textarea></label><button class="primair">Versturen</button></form>` : tab === "gesprekken" ? composer() : ""}
      </section>
      <aside class="kolom mensen" id="mensen">${mensenHtml()}</aside>
    </div>`;
  bind();
}

function inhoud() {
  if (modus === "dm") {
    return dmBerichten.map((bericht) => `<div class="bericht"><b>${esc(publiekeNaam(bericht.maker_id))}</b> <small>${tijd(bericht.created_at)}</small><div>${esc(bericht.tekst)}</div></div>`).join("") || `<p class="zacht">Nog niets. Stuur het eerste bericht.</p>`;
  }
  if (tab === "agenda") { await laadAfspraken(); teken(); return; }
  if (tab === "taken") {
    return taken.length ? taken.map((rij) => `<article class="draad"><span class="label">TER CONTROLE</span> <b>${esc(rij.titel)}</b><p>${rij.soort === "boom" ? "Beslisboom" : "Feitcode"} · ${esc(rij.sleutel)} · voorgelegd door ${esc(rij.indiener)}</p>${ik.rol === "beheerder" ? `<button class="primair" data-keur="${esc(rij.id)}" type="button">Goedkeuren en op boaportaal.nl zetten</button>` : `<p class="zacht">Wacht op de hoofdbeheerder.</p>`}</article>`).join("") : `<p class="zacht">Er ligt niets ter goedkeuring.</p>`;
  }
  if (tab === "tickets") {
    const tickets = berichten.filter((rij) => rij.kaart?.type === "ticket");
    return tickets.length ? tickets.map((rij) => `<article class="draad"><b>${esc(rij.kaart.nummer)}</b>${kaartHtml(rij.kaart)}<small>Gekoppeld door ${esc(publiekeNaam(rij.maker_id))}</small></article>`).join("") : `<p class="zacht">Nog geen ticket gekoppeld in dit kanaal.</p>`;
  }
  if (tab === "agenda") return agendaHtml();
  return onderwerpen.map(draadHtml).join("") || `<p class="zacht">Nog geen gesprek. Begin onderaan een onderwerp.</p>`;
}

function agendaHtml() {
  const nu = new Date();
  const komend = afspraken.filter((a) => new Date(a.einde) >= nu && a.status !== "geannuleerd").sort((a, b) => new Date(a.start) - new Date(b.start));
  const open = afspraken.find((a) => a.id === afspraakOpen);
  const form = `<form class="kaart" id="afspraak-form" style="margin-bottom:16px">
    <h3 style="margin:0 0 8px">Nieuwe afspraak</h3>
    <label>Titel<input name="titel" required value="${esc(afspraakConcept.titel)}"></label>
    <div class="rij"><label>Start<input name="start" type="datetime-local" required value="${esc(afspraakConcept.start)}"></label><label>Einde<input name="einde" type="datetime-local" required value="${esc(afspraakConcept.einde)}"></label></div>
    <label>Omschrijving<textarea name="omschrijving">${esc(afspraakConcept.omschrijving)}</textarea></label>
    <label>Deelnemers (Client-IDs, komma)<input name="deelnemers" placeholder="BP-0001-AB, BP-0002-CD" value="${esc(afspraakConcept.deelnemers.join(", "))}"></label>
    <button class="primair" type="submit">Inplannen en link maken</button>
  </form>`;
  const lijst = komend.length ? komend.map((a) => `<article class="draad" data-afspraak="${esc(a.id)}" style="cursor:pointer">
    <b>${esc(a.titel)}</b><br><small>${tijd(a.start)} – ${tijd(a.einde)}</small>
    <p style="margin:6px 0 0">${esc(a.omschrijving || "")}</p>
    <small>Door ${esc(publiekeNaam(a.gemaakt_door))}${a.deelnemers?.length ? " · " + a.deelnemers.map(publiekeNaam).join(", ") : ""}</small>
    ${open && open.id === a.id ? `<div style="margin-top:8px"><button class="sec" data-kopieer="${esc(a.invite_token)}" type="button">Kopieer uitnodigingslink</button> <button class="sec" data-ics="${esc(a.id)}" type="button">Download .ics</button> ${a.gemaakt_door === ik.client_id ? `<button class="sec" data-annuleer="${esc(a.id)}" type="button">Annuleren</button>` : ""}</div>` : ""}
  </article>`).join("") : `<p class="zacht">Nog geen afspraken. Plan er een in.</p>`;
  return form + lijst;
}

function composer() {
  return `<form class="composer" id="nieuw">
    ${paneel === "ticket" ? `<label>Ticketnummer<input id="ticketnr" placeholder="M2611-0412"></label><button class="sec" id="zoek-ticket" type="button">Zoek het ticket</button><div id="treffers"></div>` : ""}
    ${paneel === "voorstel" ? `<div class="rij"><label>Soort<select id="soort"><option value="feit">Feitcode</option><option value="boom">Beslisboom</option></select></label><label>Code of id<input id="sleutel" placeholder="D 517 of sfeer"></label></div><label>Titel<input id="voorstel-titel"></label><label>Artikel, alleen bij een feitcode<input id="artikel"></label><label>Tekst die op de site mag<textarea id="voorstel-tekst"></textarea></label><button class="primair" id="leg-voor" type="button">Voorleggen aan de hoofdbeheerder</button>` : ""}
    <div class="rij"><label>Label<select id="label">${["TER CONTROLE", "TICKET", "VRAAG", "AFSPRAAK"].map((label) => `<option ${labelConcept === label ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>Onderwerp<input id="titel" value="${esc(titelConcept)}" placeholder="Korte titel"></label></div>
    <label>Bericht<textarea id="tekst">${esc(concept)}</textarea></label>
    <div class="rij"><button class="primair">Onderwerp plaatsen</button><button class="sec" id="koppel" type="button">Koppel servicedesk-ticket</button><button class="sec" id="stel-voor" type="button">Nieuwe feitcode of beslisboom voorstellen</button></div>
  </form>`;
}

function wisselNacht() {
  const aan = !document.documentElement.classList.contains("night");
  document.documentElement.classList.toggle("night", aan);
  localStorage.setItem("overleg-night", aan ? "1" : "0");
  teken();
}

function bindLicht() {
  document.querySelectorAll("[data-open]").forEach((kaart) => kaart.onclick = (event) => {
    if (event.target.closest("button, textarea, input, a")) return;
    openId = openId === kaart.dataset.open ? "" : kaart.dataset.open;
    teken();
    if (openId) laad();
  });
  document.querySelectorAll("[data-reageer]").forEach((knop) => knop.onclick = () => reageer(knop.dataset.reageer));
  document.querySelectorAll("[data-stem]").forEach((knop) => knop.onclick = () => stempel(knop.dataset.stem, knop.dataset.code));
  document.querySelectorAll("[data-keur]").forEach((knop) => knop.onclick = () => keur(knop.dataset.keur));
  document.querySelectorAll("[data-dm]").forEach((knop) => knop.onclick = () => openDm(knop.dataset.dm));
  document.getElementById("dm-form")?.addEventListener("submit", stuurDm);
  document.getElementById("dm-tekst")?.addEventListener("input", (event) => { conceptDm = event.target.value; });
}

function bind() {
  document.getElementById("uit").onclick = afmelden;
  document.getElementById("nacht")?.addEventListener("click", wisselNacht);
  document.querySelectorAll("[data-kanaal]").forEach((knop) => knop.onclick = () => { modus = "kanaal"; kanaal = knop.dataset.kanaal; openId = ""; meedoen = false; tab = "gesprekken"; laad(); });
  document.getElementById("afspraak-form")?.addEventListener("submit", maakAfspraak);
  document.querySelectorAll("[data-afspraak]").forEach((kaart) => kaart.onclick = (e) => { if (e.target.closest("button")) return; afspraakOpen = afspraakOpen === kaart.dataset.afspraak ? "" : kaart.dataset.afspraak; teken(); });
  document.querySelectorAll("[data-kopieer]").forEach((knop) => knop.onclick = async (e) => { e.stopPropagation(); const link = "https://overleg.boaportaal.nl/?afspraak=" + knop.dataset.kopieer; try { await navigator.clipboard.writeText(link); knop.textContent = "Gekopieerd"; setTimeout(() => knop.textContent = "Kopieer uitnodigingslink", 1500); } catch { alert(link); } });
  document.querySelectorAll("[data-ics]").forEach((knop) => knop.onclick = (e) => { e.stopPropagation(); const a = afspraken.find(x => x.id === knop.dataset.ics); if (a) icsVan(a); });
  document.querySelectorAll("[data-annuleer]").forEach((knop) => knop.onclick = async (e) => { e.stopPropagation(); if (!confirm("Annuleren?")) return; await sb.from("boa_afspraak").update({ status: "geannuleerd" }).eq("id", knop.dataset.annuleer); afspraken = afspraken.filter(x => x.id !== knop.dataset.annuleer); teken(); });
  document.querySelectorAll("[data-tab]").forEach((knop) => knop.onclick = async () => {
    modus = "kanaal";
    tab = knop.dataset.tab;
    if (tab === "taken") {
      try { taken = (await api({ actie: "taken" })).taken || []; } catch { taken = []; }
    }
    teken();
  });
  document.getElementById("nieuw")?.addEventListener("submit", plaats);
  document.getElementById("tekst")?.addEventListener("input", (event) => { concept = event.target.value; });
  document.getElementById("titel")?.addEventListener("input", (event) => { titelConcept = event.target.value; });
  document.getElementById("label")?.addEventListener("change", (event) => { labelConcept = event.target.value; });
  document.getElementById("koppel")?.addEventListener("click", () => { paneel = paneel === "ticket" ? "" : "ticket"; teken(); });
  document.getElementById("stel-voor")?.addEventListener("click", () => { paneel = paneel === "voorstel" ? "" : "voorstel"; teken(); });
  document.getElementById("zoek-ticket")?.addEventListener("click", zoekTicket);
  document.getElementById("leg-voor")?.addEventListener("click", legVoor);
  document.getElementById("audio")?.addEventListener("click", () => startCall(false));
  document.getElementById("video")?.addEventListener("click", () => startCall(true));
  document.getElementById("mee")?.addEventListener("click", () => { callVideo = true; meedoen = true; teken(); });
  document.getElementById("weg")?.addEventListener("click", () => { stopGesprek(); meedoen = false; teken(); });
  document.getElementById("sluit")?.addEventListener("click", sluitCall);
  document.getElementById("deel")?.addEventListener("click", deelKlant);
  document.getElementById("status")?.addEventListener("change", bewaarStatus);
  document.getElementById("aanduiding")?.addEventListener("change", bewaarStatus);
  const vak = document.getElementById("gesprek");
  if (vak && !vak.dataset.aan) {
    vak.dataset.aan = "1";
    const huidig = kanalen.find((rij) => rij.id === kanaal);
    if (huidig?.call_room) startGesprek(vak, { room: huidig.call_room, naam: publiekeNaam(), video: callVideo });
  }
  bindLicht();
}

async function aanmelden(event) {
  event.preventDefault();
  fout = "";
  const f = new FormData(event.target);
  const { error } = await sb.auth.signInWithPassword({ email: String(f.get("email") || "").trim(), password: String(f.get("password") || "") });
  if (error) { fout = "Aanmelden lukt niet."; teken(); return; }
  await start();
}

async function afmelden() {
  await sb.auth.signOut();
  ik = null;
  location.reload();
}

async function start() {
  const params = new URLSearchParams(location.search);
  const token = params.get("afspraak");
  if (token) {
    const { data } = await sb.from("boa_afspraak").select("*").eq("invite_token", token).maybeSingle();
    if (data) { afspraakOpen = data.id; tab = "agenda"; }
  }
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  if (!user) { ik = null; teken(); return; }
  const { data: profiel } = await sb.rpc("boa_ik");
  ik = {
    email: user.email || "",
    client_id: profiel?.client_id || "",
    pv_naam: profiel?.pv_naam || "",
    rol: profiel?.rol || "",
    medewerker: Boolean(profiel?.medewerker),
    status: "aanwezig",
    aanduiding: "",
  };
  if (!ik.medewerker) { teken(); return; }
  const { data: status } = await sb.from("boa_overleg_status").select("status, aanduiding").eq("client_id", ik.client_id).maybeSingle();
  if (status) { ik.status = status.status; ik.aanduiding = status.aanduiding || ""; }
  await laadKanalen(false);
  await laadTeam();
  await laadDms();
  await laad();
  if (!live) {
    live = sb.channel("overleg-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "boa_onderwerp" }, plan)
      .on("postgres_changes", { event: "*", schema: "public", table: "boa_bericht" }, plan)
      .on("postgres_changes", { event: "*", schema: "public", table: "boa_stempel" }, plan)
      .on("postgres_changes", { event: "*", schema: "public", table: "boa_kanaal" }, () => laadKanalen())
      .on("postgres_changes", { event: "*", schema: "public", table: "boa_dm" }, laadDms)
      .on("postgres_changes", { event: "*", schema: "public", table: "boa_dm_bericht" }, plan)
      .on("postgres_changes", { event: "*", schema: "public", table: "boa_afspraak" }, () => { if (tab === "agenda") laadAfspraken().then(teken); })
      .subscribe();
    kamer = sb.channel("overleg-aanwezig");
    kamer.on("presence", { event: "sync" }, () => {
      aanwezig = kamer.presenceState();
      const lijst = document.getElementById("lijst");
      const teller = document.getElementById("online");
      if (lijst) lijst.innerHTML = mensenHtmlLijst();
      if (teller) teller.textContent = `${mensen().filter((persoon) => persoon.status !== "afwezig").length} beschikbaar`;
      bindLicht();
    });
    kamer.subscribe(async (staat) => { if (staat === "SUBSCRIBED") await kamer.track(spoor()); });
  }
}

function spoor() {
  return { client_id: ik.client_id, rol: ik.rol, status: ik.status, aanduiding: ik.aanduiding };
}

async function bewaarStatus() {
  ik.status = document.getElementById("status").value;
  ik.aanduiding = document.getElementById("aanduiding").value.slice(0, 80);
  await sb.from("boa_overleg_status").upsert({ client_id: ik.client_id, status: ik.status, aanduiding: ik.aanduiding });
  if (kamer) await kamer.track(spoor());
}

function plan() {
  clearTimeout(wacht);
  wacht = setTimeout(() => { if (modus === "dm") laadDm(); else laad(); }, 80);
}

async function laadTeam() {
  const namen = await sb.rpc("boa_overleg_team");
  if (!namen.error && Array.isArray(namen.data)) team = namen.data;
}

async function laadDms() {
  const { data, error } = await sb.from("boa_dm").select("id, a, b").or(`a.eq.${ik.client_id},b.eq.${ik.client_id}`);
  if (!error && data) {
    dms = data;
    const vak = document.getElementById("dms");
    if (vak) vak.innerHTML = dmLijstHtml();
    bindLicht();
  }
}

async function laadKanalen(metTekenen = true) {
  const { data, error } = await sb.from("boa_kanaal").select("id, naam, omschrijving, volgorde, call_room, call_door").order("volgorde");
  if (error) { fout = "Draai schema-0015.sql in Supabase. Daarna verversen."; teken(); return; }
  kanalen = data || [];
  if (!kanalen.some((rij) => rij.id === kanaal) && kanalen[0]) kanaal = kanalen[0].id;
  if (!kanalen.find((rij) => rij.id === kanaal)?.call_room) meedoen = false;
  if (metTekenen) teken();
}

async function laad() {
  if (bezig) { opnieuw = true; return; }
  bezig = true;
  const { data: onder, error } = await sb.from("boa_onderwerp").select("id, kanaal_id, titel, label, maker_id, created_at").eq("kanaal_id", kanaal).order("created_at", { ascending: false }).limit(40);
  if (error) { fout = "Draai schema-0015.sql in Supabase. Daarna verversen."; bezig = false; teken(); return; }
  onderwerpen = onder || [];
  const ids = onderwerpen.map((rij) => rij.id);
  berichten = [];
  stempels = [];
  if (ids.length) {
    const berichtenUit = await sb.from("boa_bericht").select("id, onderwerp_id, maker_id, tekst, kaart, created_at").in("onderwerp_id", ids).order("created_at");
    berichten = berichtenUit.data || [];
    if (openId) {
      const berichtIds = berichten.filter((rij) => rij.onderwerp_id === openId).map((rij) => rij.id);
      if (berichtIds.length) stempels = (await sb.from("boa_stempel").select("bericht_id, client_id, stempel").in("bericht_id", berichtIds)).data || [];
    }
  }
  fout = "";
  bezig = false;
  teken();
  if (opnieuw) { opnieuw = false; await laad(); }
}

async function laadAfspraken() {
  const { data, error } = await sb.from("boa_afspraak").select("*").neq("status", "geannuleerd").order("start");
  if (!error && data) afspraken = data;
}

async function maakAfspraak(event) {
  event.preventDefault();
  const f = new FormData(event.target);
  const titel = String(f.get("titel") || "").trim();
  const start = f.get("start");
  const einde = f.get("einde");
  const omschrijving = String(f.get("omschrijving") || "").trim();
  const deelnemers = String(f.get("deelnemers") || "").split(",").map(s => s.trim()).filter(Boolean);
  if (!titel || !start || !einde) return;
  const { data, error } = await sb.from("boa_afspraak").insert({
    titel, omschrijving, start: new Date(start).toISOString(), einde: new Date(einde).toISOString(),
    gemaakt_door: ik.client_id, deelnemers, kanaal_id: kanaal
  }).select().single();
  if (error) { fout = "Afspraak niet opgeslagen. Draai schema-0025.sql."; teken(); return; }
  afspraken.unshift(data);
  afspraakOpen = data.id;
  afspraakConcept = { titel: "", start: "", einde: "", omschrijving: "", deelnemers: [] };
  fout = "";
  teken();
}

function icsVan(a) {
  const pad = (n) => String(n).padStart(2, "0");
  const dt = (d) => { const x = new Date(d); return x.getUTCFullYear() + pad(x.getUTCMonth()+1) + pad(x.getUTCDate()) + "T" + pad(x.getUTCHours()) + pad(x.getUTCMinutes()) + pad(x.getUTCSeconds()) + "Z"; };
  const body = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//BOA Portaal//Overleg//NL
BEGIN:VEVENT
UID:${a.id}@overleg.boaportaal.nl
DTSTAMP:${dt(new Date())}
DTSTART:${dt(a.start)}
DTEND:${dt(a.einde)}
SUMMARY:${a.titel.replace(/\n/g, " ")}
DESCRIPTION:${(a.omschrijving || "").replace(/\n/g, "\\n")}
URL:https://overleg.boaportaal.nl/?afspraak=${a.invite_token}
END:VEVENT
END:VCALENDAR`;
  const blob = new Blob([body], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const ael = document.createElement("a");
  ael.href = url; ael.download = a.titel.replace(/[^a-z0-9]/gi, "_") + ".ics";
  ael.click();
  URL.revokeObjectURL(url);
}

async function laadDm() {
  if (!dmId) return;
  const { data, error } = await sb.from("boa_dm_bericht").select("id, maker_id, tekst, created_at").eq("dm_id", dmId).order("created_at").limit(200);
  if (error) { fout = "Het gesprek is niet geladen. Draai schema-0017.sql."; teken(); return; }
  dmBerichten = data || [];
  fout = "";
  teken();
}

async function openDm(ander) {
  if (!ander || ander === ik.client_id) return;
  const { data, error } = await sb.rpc("boa_dm_open", { p_ander: ander });
  if (error || !data) { fout = "Het 1-op-1-gesprek start niet. Draai schema-0017.sql."; teken(); return; }
  modus = "dm";
  dmId = data;
  if (!dms.some((dm) => dm.id === data)) {
    const [a, b] = data.split("|");
    dms.unshift({ id: data, a, b });
  }
  await laadDm();
}

async function stuurDm(event) {
  event.preventDefault();
  const tekst = conceptDm.trim();
  if (!tekst || !dmId) return;
  conceptDm = "";
  const veld = document.getElementById("dm-tekst");
  if (veld) veld.value = "";
  dmBerichten.push({ id: crypto.randomUUID(), maker_id: ik.client_id, tekst, created_at: new Date().toISOString() });
  teken();
  const { error } = await sb.from("boa_dm_bericht").insert({ dm_id: dmId, maker_id: ik.client_id, tekst });
  if (error) { fout = "Het bericht is niet weg. Draai schema-0017.sql."; teken(); }
}

async function plaats(event) {
  event.preventDefault();
  fout = "";
  const titel = titelConcept.trim();
  const tekst = concept.trim();
  if (!titel || !tekst) { fout = "Vul een titel en een bericht in."; teken(); return; }
  const gemaakt = await sb.from("boa_onderwerp").insert({ kanaal_id: kanaal, titel, label: labelConcept, maker_id: ik.client_id, maker_naam: publiekeNaam() }).select("id").single();
  if (gemaakt.error || !gemaakt.data) { fout = "Het onderwerp is niet geplaatst."; teken(); return; }
  await sb.from("boa_bericht").insert({ onderwerp_id: gemaakt.data.id, maker_id: ik.client_id, maker_naam: publiekeNaam(), tekst });
  concept = "";
  titelConcept = "";
  await laad();
}

async function reageer(id) {
  const veld = document.querySelector(`[data-reactie="${id}"]`);
  const tekst = veld?.value.trim() || "";
  if (!tekst) return;
  await sb.from("boa_bericht").insert({ onderwerp_id: id, maker_id: ik.client_id, maker_naam: publiekeNaam(), tekst });
  await laad();
}

async function stempel(berichtId, code) {
  const eigen = stempels.some((stem) => stem.bericht_id === berichtId && stem.client_id === ik.client_id && stem.stempel === code);
  if (eigen) await sb.from("boa_stempel").delete().match({ bericht_id: berichtId, client_id: ik.client_id, stempel: code });
  else await sb.from("boa_stempel").insert({ bericht_id: berichtId, client_id: ik.client_id, pv_naam: publiekeNaam(), stempel: code });
  await laad();
}

async function zoekTicket() {
  fout = "";
  try {
    const uit = await api({ actie: "ticket", nummer: document.getElementById("ticketnr").value });
    const vak = document.getElementById("treffers");
    vak.innerHTML = uit.tickets.length ? uit.tickets.map((rij) => `<button class="sec" type="button" data-ticket="${esc(rij.nummer)}" data-cid="${esc(rij.client_id)}" data-naam="${esc(rij.pv_naam)}" data-staat="${esc(rij.status)}">${esc(rij.nummer)} · ${esc(rij.client_id)}</button>`).join("") : `<p class="zacht">Geen ticket met dat nummer.</p>`;
    vak.querySelectorAll("[data-ticket]").forEach((knop) => knop.onclick = () => koppelTicket(knop.dataset));
  } catch (err) { fout = err.message; teken(); }
}

async function koppelTicket(rij) {
  const titel = `Ticket ${rij.ticket}`;
  const gemaakt = await sb.from("boa_onderwerp").insert({ kanaal_id: kanaal, titel, label: "TICKET", maker_id: ik.client_id, maker_naam: publiekeNaam() }).select("id").single();
  if (gemaakt.error) { fout = "Het ticket is niet gekoppeld."; teken(); return; }
  await sb.from("boa_bericht").insert({
    onderwerp_id: gemaakt.data.id,
    maker_id: ik.client_id,
    maker_naam: publiekeNaam(),
    tekst: "Ticket gekoppeld om er samen naar te kijken.",
    kaart: { type: "ticket", nummer: rij.ticket, client_id: rij.cid, pv_naam: rij.naam, status: rij.staat },
  });
  paneel = "";
  await laad();
}

async function legVoor() {
  fout = "";
  try {
    const uit = await api({
      actie: "voorstel",
      soort: document.getElementById("soort").value,
      sleutel: document.getElementById("sleutel").value,
      titel: document.getElementById("voorstel-titel").value,
      artikel: document.getElementById("artikel").value,
      tekst: document.getElementById("voorstel-tekst").value,
    });
    const voorstel = uit.voorstel;
    const gemaakt = await sb.from("boa_onderwerp").insert({ kanaal_id: kanaal, titel: voorstel.titel, label: "TER CONTROLE", maker_id: ik.client_id, maker_naam: publiekeNaam() }).select("id").single();
    if (!gemaakt.error) {
      await sb.from("boa_bericht").insert({
        onderwerp_id: gemaakt.data.id,
        maker_id: ik.client_id,
        maker_naam: publiekeNaam(),
        tekst: "Voorgelegd vanuit het overleg. De site toont het pas na goedkeuring.",
        kaart: { type: "voorstel", id: voorstel.id, soort: voorstel.soort, sleutel: voorstel.sleutel, titel: voorstel.titel },
      });
    }
    paneel = "";
    await laad();
  } catch (err) { fout = err.message; teken(); }
}

async function keur(id) {
  fout = "";
  try {
    await api({ actie: "keur", id });
    const bericht = berichten.find((rij) => rij.kaart?.id === id);
    if (bericht) await sb.from("boa_bericht").insert({ onderwerp_id: bericht.onderwerp_id, maker_id: ik.client_id, maker_naam: publiekeNaam(), tekst: "Goedgekeurd en op boaportaal.nl gezet." });
    await laad();
  } catch (err) { fout = err.message; teken(); }
}

async function startCall(video) {
  const huidig = kanalen.find((rij) => rij.id === kanaal);
  let room = huidig?.call_room || "";
  if (!room) {
    room = `boa${kanaal}${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const { error } = await sb.rpc("boa_overleg_call", { p_kanaal: kanaal, p_room: room });
    if (error) { fout = "De vergadering start niet. Draai schema-0015.sql."; teken(); return; }
  }
  callVideo = video;
  meedoen = true;
  await laadKanalen();
}

async function deelKlant() {
  const huidig = kanalen.find((rij) => rij.id === kanaal);
  if (!huidig?.call_room) return;
  const link = `https://overleg.boaportaal.nl/gast.html?room=${encodeURIComponent(huidig.call_room)}`;
  try { await navigator.clipboard.writeText(link); } catch { window.prompt("Link voor de klant", link); return; }
  const knop = document.getElementById("deel");
  if (knop) knop.textContent = "Link gekopieerd";
}

async function sluitCall() {
  stopGesprek();
  await sb.rpc("boa_overleg_call", { p_kanaal: kanaal, p_room: "" });
  meedoen = false;
  await laadKanalen();
}

const sessie = await sb.auth.getSession();
if (sessie.data.session) await start();
else teken();
