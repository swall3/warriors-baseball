import "../../practice.css";
import CustomDrillEditor from "@/components/coach/CustomDrillEditor";

export default async function Page({ params }: { params: Promise<{ drillId: string }> }) {
  return <CustomDrillEditor drillId={(await params).drillId} />;
}
