import { RpcError } from "livekit-client";
import type { LocalParticipant, RpcInvocationData } from "livekit-client";
import type { TutorCanvas } from "@/lib/tutor/tutorCanvas";

/** RPC methods the tutor agent can invoke in the browser (spec.md sections 7-8). */
export function registerCanvasRpcs(participant: LocalParticipant, canvas: TutorCanvas): void {
  participant.registerRpcMethod("get_canvas_state", async () => {
    return JSON.stringify(canvas.getCanvasState());
  });

  participant.registerRpcMethod("write_latex", async (data: RpcInvocationData) => {
    let args: { latex?: unknown; x?: unknown; y?: unknown };
    try {
      args = JSON.parse(data.payload);
    } catch {
      throw new RpcError(1, "write_latex: payload is not valid JSON");
    }
    const result = await canvas.writeLatex({
      latex: typeof args.latex === "string" ? args.latex : "",
      x: Number(args.x),
      y: Number(args.y),
    });
    return JSON.stringify(result);
  });
}
