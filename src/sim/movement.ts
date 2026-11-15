/**
 * Turn the stick into a camera-relative direction.
 *
 * `forward` is the camera's horizontal look direction. The horizontal stick is
 * reversed because the camera looks from behind the character, so pushing the
 * stick right must move toward the right side of the screen.
 */
export function cameraRelativeDirection(
  forwardX: number,
  forwardZ: number,
  moveX: number,
  moveY: number
): { x: number; z: number } {
  const side = -moveX;
  return {
    x: forwardX * moveY + forwardZ * side,
    z: forwardZ * moveY - forwardX * side
  };
}
