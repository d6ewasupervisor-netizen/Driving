/**
 * ZombieRoadWarrior — 3D R3F driving game wrapper
 * The 2D HTML game has been replaced by a full React Three Fiber 3D experience.
 */
import { Game3D } from './Game3D/Game3D';

export default function ZombieRoadWarrior({ onExit }: { onExit?: () => void }) {
  return <Game3D onExit={onExit} />;
}
