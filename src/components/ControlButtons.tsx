"use client";
import { useTransition } from "react";
import { setAgentStatus, emergencyStop, runSearchNow } from "@/app/actions";

export function ControlButtons({ status, emergency }: { status: string; emergency: boolean }) {
  const [pending, start] = useTransition();
  const running = status === "running" && !emergency;
  return (
    <div className="flex flex-wrap gap-2">
      {running ? (
        <button className="btn btn-ghost" disabled={pending} onClick={() => start(() => setAgentStatus("paused"))}>Pause</button>
      ) : (
        <button className="btn btn-primary" disabled={pending} onClick={() => start(() => setAgentStatus("running"))}>
          {emergency ? "Clear stop & resume" : "Resume"}
        </button>
      )}
      <button className="btn btn-ghost" disabled={pending || !running} onClick={() => start(() => runSearchNow())}>Search now</button>
      <button className="btn btn-danger ml-auto" disabled={pending || emergency}
        onClick={() => { if (confirm("Emergency stop: halt all automation immediately?")) start(() => emergencyStop()); }}>
        Emergency stop
      </button>
    </div>
  );
}
