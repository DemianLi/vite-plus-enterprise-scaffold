import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Dialog } from "radix-ui";

function Spike() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>開啟</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay />
        <Dialog.Content>
          <Dialog.Title>示範</Dialog.Title>
          <Dialog.Description>Radix Dialog 在 CSP 下的樣式注入</Dialog.Description>
          <Dialog.Close>關閉</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Spike />
  </StrictMode>,
);
