import FlashCanvas from "@/components/FlashCanvas";

export default async function Page({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  return <FlashCanvas meetingId={meetingId} />;
}
