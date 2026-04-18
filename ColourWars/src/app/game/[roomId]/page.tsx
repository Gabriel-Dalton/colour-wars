import GameClient from './GameClient';

export default function GamePage({ params }: { params: { roomId: string } }) {
  return <GameClient roomId={params.roomId.toUpperCase()} />;
}
