import GameInsightsScreen from "@/components/coach/GameInsightsScreen";
export default async function Page({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  return <GameInsightsScreen gameId={(await params).gameId} />;
}
