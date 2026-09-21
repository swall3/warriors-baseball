import LiveGameScreen from "@/components/coach/LiveGameScreen";
export default async function Page({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = await params;
  return <LiveGameScreen gameId={gameId} />;
}
