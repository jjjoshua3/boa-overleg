const SB_URL = "https://ofzyqwpztohflxdhqgbb.supabase.co";
const SB_KEY = "sb_publishable_x8nU8ype6b1KOL6K8lS2Iw_DDjz4Olr";

let kanaal = null;
let lokaal = null;
let scherm = null;
let uit = null;
let wazig = false;
let raf = 0;
let segmenter = null;
let segmenterLaden = null;

function laadSegmenter() {
  if (segmenter) return Promise.resolve(segmenter);
  if (segmenterLaden) return segmenterLaden;
  segmenterLaden = new Promise((resolve, reject) => {
    if (window.SelfieSegmentation) {
      resolve(window.SelfieSegmentation);
      return;
    }
    const script = document.createElement("script");
    script.src = "/mediapipe/selfie_segmentation.js";
    script.onload = () => resolve(window.SelfieSegmentation);
    script.onerror = () => reject(new Error("Het wazig maken kon niet laden."));
    document.head.appendChild(script);
  }).then((SelfieSegmentation) => {
    const model = new SelfieSegmentation({ locateFile: (file) => `/mediapipe/${file}` });
    model.setOptions({ modelSelection: 1, selfieMode: false });
    segmenter = model;
    return model;
  }).catch((fout) => {
    segmenterLaden = null;
    throw fout;
  });
  return segmenterLaden;
}

export async function startGesprek(doel, { room, naam, video }) {
  stopGesprek();
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.1");
  const sb = createClient(SB_URL, SB_KEY);
  const ik = crypto.randomUUID();
  const peers = new Map();
  doel.innerHTML = `<div class="videos"></div><div class="hostbalk"><button type="button" id="gs-mic">Microfoon uit</button><button type="button" id="gs-cam">Camera uit</button><button type="button" id="gs-wazig">Achtergrond wazig</button><button type="button" id="gs-scherm">Scherm delen</button></div>`;
  const videos = doel.querySelector(".videos");
  const zelf = document.createElement("video");
  zelf.className = "zelf";
  zelf.autoplay = true;
  zelf.muted = true;
  zelf.playsInline = true;
  videos.appendChild(zelf);
  try {
    lokaal = await navigator.mediaDevices.getUserMedia({ audio: true, video: video !== false });
  } catch {
    doel.insertAdjacentHTML("afterbegin", `<p class="fout">De browser blokkeert camera of microfoon. Zet beide aan en ververs.</p>`);
    return;
  }

  const doek = document.createElement("canvas");
  doek.width = 640;
  doek.height = 480;
  const ctx = doek.getContext("2d");
  const bron = document.createElement("video");
  bron.muted = true;
  bron.playsInline = true;
  const camera = lokaal.getVideoTracks()[0];
  if (camera) {
    bron.srcObject = new MediaStream([camera]);
    await bron.play();
  }
  const beeld = doek.captureStream(24).getVideoTracks()[0];
  const audio = lokaal.getAudioTracks()[0];
  uit = new MediaStream([beeld, audio].filter(Boolean));
  zelf.srcObject = camera ? uit : lokaal;

  let klaar = true;
  function tekenScherp() {
    const w = bron.videoWidth || 640;
    const h = bron.videoHeight || 480;
    if (doek.width !== w) doek.width = w;
    if (doek.height !== h) doek.height = h;
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    if (!camera || !camera.enabled) {
      ctx.fillStyle = "#111";
      ctx.fillRect(0, 0, w, h);
      return;
    }
    ctx.drawImage(bron, 0, 0, w, h);
  }
  function tekenWazig(results) {
    const w = doek.width || results.image.width || 640;
    const h = doek.height || results.image.height || 480;
    if (doek.width !== w) doek.width = w;
    if (doek.height !== h) doek.height = h;
    ctx.save();
    ctx.clearRect(0, 0, w, h);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(results.segmentationMask, 0, 0, w, h);
    ctx.globalCompositeOperation = "source-in";
    ctx.drawImage(results.image, 0, 0, w, h);
    ctx.globalCompositeOperation = "destination-over";
    ctx.filter = "blur(16px)";
    ctx.drawImage(results.image, 0, 0, w, h);
    ctx.restore();
  }
  if (segmenter) segmenter.onResults(tekenWazig);
  function lus() {
    raf = requestAnimationFrame(lus);
    if (!wazig || scherm || !camera?.enabled || !segmenter) {
      tekenScherp();
      return;
    }
    if (!klaar) return;
    klaar = false;
    segmenter.send({ image: bron }).then(() => { klaar = true; }).catch(() => { klaar = true; tekenScherp(); });
  }
  lus();

  function verstuur(payload) {
    kanaal?.send({ type: "broadcast", event: "sein", payload: { ...payload, from: ik, naam } });
  }

  function beeldVan(id, stream) {
    let videoEl = videos.querySelector(`[data-peer="${id}"]`);
    if (!videoEl) {
      videoEl = document.createElement("video");
      videoEl.dataset.peer = id;
      videoEl.autoplay = true;
      videoEl.playsInline = true;
      videos.appendChild(videoEl);
    }
    videoEl.srcObject = stream;
  }

  function videoNu() {
    if (scherm) return scherm.getVideoTracks()[0];
    return beeld;
  }

  function pcVoor(ander) {
    if (peers.has(ander)) return peers.get(ander);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    for (const track of uit.getTracks()) pc.addTrack(track, uit);
    if (scherm) {
      const schermTrack = scherm.getVideoTracks()[0];
      const sender = pc.getSenders().find((item) => item.track && item.track.kind === "video");
      if (sender && schermTrack) sender.replaceTrack(schermTrack);
    }
    pc.onicecandidate = (event) => {
      if (event.candidate) verstuur({ type: "ice", to: ander, candidate: event.candidate });
    };
    pc.ontrack = (event) => beeldVan(ander, event.streams[0]);
    peers.set(ander, pc);
    return pc;
  }

  async function vervang(track) {
    for (const pc of peers.values()) {
      const sender = pc.getSenders().find((item) => item.track && item.track.kind === "video");
      if (sender && track) await sender.replaceTrack(track);
    }
  }

  async function bied(ander) {
    const pc = pcVoor(ander);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    verstuur({ type: "offer", to: ander, sdp: pc.localDescription });
  }

  kanaal = sb.channel(`gesprek-${room}`);
  kanaal.on("broadcast", { event: "sein" }, async ({ payload }) => {
    if (!payload || payload.from === ik) return;
    if (payload.to && payload.to !== ik) return;
    if (payload.type === "hello") {
      if (ik > payload.from) await bied(payload.from);
      return;
    }
    const pc = pcVoor(payload.from);
    if (payload.type === "offer") {
      await pc.setRemoteDescription(payload.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      verstuur({ type: "answer", to: payload.from, sdp: pc.localDescription });
    } else if (payload.type === "answer") {
      if (!pc.currentRemoteDescription) await pc.setRemoteDescription(payload.sdp);
    } else if (payload.type === "ice" && payload.candidate) {
      try { await pc.addIceCandidate(payload.candidate); } catch { /* te vroeg */ }
    }
  });
  kanaal.subscribe((staat) => {
    if (staat === "SUBSCRIBED") verstuur({ type: "hello" });
  });

  doel.querySelector("#gs-mic").onclick = () => {
    const track = lokaal.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    doel.querySelector("#gs-mic").textContent = track.enabled ? "Microfoon uit" : "Microfoon aan";
  };
  doel.querySelector("#gs-cam").onclick = () => {
    if (!camera) return;
    camera.enabled = !camera.enabled;
    doel.querySelector("#gs-cam").textContent = camera.enabled ? "Camera uit" : "Camera aan";
  };
  const wazigKnop = doel.querySelector("#gs-wazig");
  if (!camera) wazigKnop.hidden = true;
  wazigKnop.onclick = async () => {
    if (!camera) return;
    if (wazig) {
      wazig = false;
      wazigKnop.textContent = "Achtergrond wazig";
      wazigKnop.classList.remove("aan");
      return;
    }
    wazigKnop.textContent = "Bezig…";
    try {
      const model = await laadSegmenter();
      model.onResults(tekenWazig);
      wazig = true;
      wazigKnop.textContent = "Wazig uit";
      wazigKnop.classList.add("aan");
    } catch {
      wazig = false;
      wazigKnop.textContent = "Achtergrond wazig";
    }
  };
  doel.querySelector("#gs-scherm").onclick = async () => {
    if (scherm) {
      scherm.getTracks().forEach((track) => track.stop());
      scherm = null;
      toonDelen(null);
      await vervang(videoNu());
      doel.querySelector("#gs-scherm").textContent = "Scherm delen";
      return;
    }
    try { scherm = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }); }
    catch { return; }
    const track = scherm.getVideoTracks()[0];
    await vervang(track);
    toonDelen(scherm);
    doel.querySelector("#gs-scherm").textContent = "Scherm stoppen";
    track.onended = () => {
      if (scherm) doel.querySelector("#gs-scherm")?.click();
    };
  };

  function toonDelen(stream) {
    videos.querySelector(".deelkader")?.remove();
    if (!stream) return;
    const kader = document.createElement("div");
    kader.className = "deelkader";
    const videoEl = document.createElement("video");
    videoEl.className = "schermbeeld";
    videoEl.autoplay = true;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.srcObject = stream;
    const label = document.createElement("span");
    label.textContent = "Dit deel je";
    kader.appendChild(videoEl);
    kader.appendChild(label);
    videos.appendChild(kader);
  }
}

export function stopGesprek() {
  cancelAnimationFrame(raf);
  raf = 0;
  wazig = false;
  uit?.getTracks().forEach((track) => track.stop());
  lokaal?.getTracks().forEach((track) => track.stop());
  scherm?.getTracks().forEach((track) => track.stop());
  uit = null;
  lokaal = null;
  scherm = null;
  if (kanaal) {
    kanaal.unsubscribe();
    kanaal = null;
  }
}
