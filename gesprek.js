const SB_URL = "https://ofzyqwpztohflxdhqgbb.supabase.co";
const SB_KEY = "sb_publishable_x8nU8ype6b1KOL6K8lS2Iw_DDjz4Olr";

let kanaal = null;
let lokaal = null;
let scherm = null;

export async function startGesprek(doel, { room, naam, video }) {
  stopGesprek();
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.49.1");
  const sb = createClient(SB_URL, SB_KEY);
  const ik = crypto.randomUUID();
  const peers = new Map();
  doel.innerHTML = `<div class="videos"></div><div class="hostbalk"><button type="button" id="gs-mic">Microfoon uit</button><button type="button" id="gs-cam">Camera uit</button><button type="button" id="gs-scherm">Scherm delen</button><span class="zacht">Eigen vergadering. Geen account en geen tweede login.</span></div>`;
  const videos = doel.querySelector(".videos");
  const zelf = document.createElement("video");
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
  zelf.srcObject = lokaal;

  function verstuur(payload) {
    kanaal?.send({ type: "broadcast", event: "sein", payload: { ...payload, from: ik, naam } });
  }

  function beeld(id, stream) {
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

  function pcVoor(ander) {
    if (peers.has(ander)) return peers.get(ander);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    for (const track of lokaal.getTracks()) pc.addTrack(track, lokaal);
    pc.onicecandidate = (event) => {
      if (event.candidate) verstuur({ type: "ice", to: ander, candidate: event.candidate });
    };
    pc.ontrack = (event) => beeld(ander, event.streams[0]);
    peers.set(ander, pc);
    return pc;
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
    const track = lokaal.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    doel.querySelector("#gs-cam").textContent = track.enabled ? "Camera uit" : "Camera aan";
  };
  doel.querySelector("#gs-scherm").onclick = async () => {
    if (scherm) {
      scherm.getTracks().forEach((track) => track.stop());
      scherm = null;
      const camera = lokaal.getVideoTracks()[0];
      for (const pc of peers.values()) {
        const sender = pc.getSenders().find((item) => item.track && item.track.kind === "video");
        if (sender && camera) await sender.replaceTrack(camera);
      }
      return;
    }
    try { scherm = await navigator.mediaDevices.getDisplayMedia({ video: true }); }
    catch { return; }
    const track = scherm.getVideoTracks()[0];
    for (const pc of peers.values()) {
      const sender = pc.getSenders().find((item) => item.track && item.track.kind === "video");
      if (sender) await sender.replaceTrack(track);
    }
    track.onended = () => doel.querySelector("#gs-scherm")?.click();
  };
}

export function stopGesprek() {
  lokaal?.getTracks().forEach((track) => track.stop());
  scherm?.getTracks().forEach((track) => track.stop());
  lokaal = null;
  scherm = null;
  if (kanaal) {
    kanaal.unsubscribe();
    kanaal = null;
  }
}
