import { useSession } from "../session";
import { PHONE, useMediaQuery } from "./useMediaQuery";
import { play, setSoundEnabled, useSoundEnabled } from "./sound";
import { SoundSwitch } from "./TopBar";

/** The sound switch, wired: turning it on answers with a blip, so the player
 *  hears that it worked. */
export function SoundToggle() {
  const sound = useSoundEnabled();
  return (
    <SoundSwitch
      sound={sound}
      onToggle={() => {
        setSoundEnabled(!sound);
        if (!sound) play("message");
      }}
    />
  );
}

/** Where a member's sound switch goes on a phone, which has no top bar (as in
 *  the home app): on the page itself, beside its heading. Nothing above phone
 *  width, nor for a guest, whose bar keeps its switch at every width. */
export function PhoneSoundToggle() {
  const session = useSession();
  const phone = useMediaQuery(PHONE);
  const member = session.status === "ready" && session.user.role !== "guest";
  return phone && member ? <SoundToggle /> : null;
}
