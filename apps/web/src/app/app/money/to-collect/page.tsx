import { redirect } from "next/navigation";

/** The old address of Outstanding. */
export default function ToCollectMoved() {
  redirect("/app/money/outstanding");
}
