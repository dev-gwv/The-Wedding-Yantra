"use client";

import { Suspense } from "react";
import { TasksScreen } from "@/components/tasks/tasks-screen";
import { Splash } from "@/components/ui/spinner";

export default function TasksTeamPage() {
  return (
    <Suspense fallback={<Splash />}>
      <TasksScreen tab="team" />
    </Suspense>
  );
}
