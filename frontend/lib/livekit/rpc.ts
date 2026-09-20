import { RpcError } from "livekit-client";
import type { Room, RpcInvocationData } from "livekit-client";
import type { TutorCanvas } from "@/lib/tutor/tutorCanvas";
import { captureBoard, getBoardStatus, highlightRegion, highlightKnownRegions, setTutorStatus } from "@/lib/tutor/boardView";
import { applyTeachingPlan } from "@/lib/tutor/teachingPlan";
import { getPaused, getPreferences } from "@/lib/tutor/support";

/** Only the agent in this student's room may inspect or annotate their board. */
export function registerCanvasRpcs(room: Room, canvas: TutorCanvas): void {
  const participant = room.localParticipant;
  const authorize = (data: RpcInvocationData) => {
    if (!room.remoteParticipants.get(data.callerIdentity)?.isAgent) throw new RpcError(1403, "Tutor only");
    if (getPaused()) throw new RpcError(1409, "Conversation paused");
  };
  const parse = (data: RpcInvocationData) => {
    authorize(data);
    try {
      const value = JSON.parse(data.payload);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object");
      return value;
    } catch { throw new RpcError(1400, "Invalid JSON object"); }
  };
  participant.registerRpcMethod("set_tutor_status", async data => {
    const args = parse(data);
    if (args.status !== "ready" && args.status !== "checking") throw new RpcError(1400, "Invalid status");
    setTutorStatus(args.status);
    return JSON.stringify({success:true});
  });
  participant.registerRpcMethod("apply_teaching_plan", async data => {
    const args = parse(data);
    return JSON.stringify(applyTeachingPlan(args));
  });
  participant.registerRpcMethod("get_canvas_state", async data => {
    authorize(data);
    const state = canvas.getCanvasState();
    // LiveKit RPC responses have a 15 KiB limit; image bytes use a separate stream.
    const compact = { ...state, question: state.question && { ...state.question, text: state.question.text.slice(0, 4000) }, equations: state.equations.slice(-8), tutorAnnotations: state.tutorAnnotations.slice(-8), preferences: getPreferences() };
    while (new TextEncoder().encode(JSON.stringify(compact)).length > 14000) {
      if (compact.tutorAnnotations.length) compact.tutorAnnotations.shift();
      else if (compact.equations.length) compact.equations.shift();
      else { compact.question = null; break; }
    }
    return JSON.stringify(compact);
  });
  participant.registerRpcMethod("get_board_status", async data => {
    authorize(data);
    return JSON.stringify(getBoardStatus());
  });
  participant.registerRpcMethod("capture_board", async data => {
    const args = parse(data);
    if (typeof args.requestId !== "string" || args.requestId.length > 80) throw new RpcError(1400, "Missing request ID");
    const { blob, view } = await captureBoard().catch(failure => {
      const message = failure instanceof Error ? failure.message : "Capture failed";
      console.warn("Whiteboard capture:", message);
      throw new RpcError(1409, message);
    });
    // Stroke membership stays local; the tutor only needs stable region IDs.
    const metadata={...view,regions:view.regions.map(({id,bounds,text})=>({id,bounds,text}))};
    if (new TextEncoder().encode(JSON.stringify(metadata)).length > 14000) throw new RpcError(1409, "Too much work in view; focus on one problem and try again");
    authorize(data);
    const writer = await participant.streamBytes({ name: "whiteboard.jpg", topic: "mimir.board", mimeType: "image/jpeg", totalSize: blob.size, destinationIdentities: [data.callerIdentity], attributes: { requestId: args.requestId } });
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      for (let i = 0; i < bytes.length; i += 15000) await writer.write(bytes.slice(i, i + 15000));
    } finally { await writer.close(); }
    return JSON.stringify(metadata);
  });
  participant.registerRpcMethod("highlight_region", async data => {
    const args = parse(data);
    return JSON.stringify(highlightRegion({ snapshotId: args.snapshotId, label: args.label, x: args.x, y: args.y, width: args.width, height: args.height }));
  });
  participant.registerRpcMethod("highlight_regions", async data => {
    const args = parse(data);
    return JSON.stringify(highlightKnownRegions(args));
  });
  participant.registerRpcMethod("write_latex", async data => {
    const args = parse(data);
    return JSON.stringify(await canvas.writeLatex({ latex: typeof args.latex === "string" ? args.latex : "", x: args.x, y: args.y }));
  });
}
