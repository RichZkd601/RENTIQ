import { useEffect, useState } from "react";
import { getPaddleEnvironment } from "@/lib/paddle";

export function PaymentTestModeBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(getPaddleEnvironment() === "sandbox");
  }, []);

  return (
    <div
      suppressHydrationWarning
      aria-hidden={!show}
      className={show ? "w-full bg-orange-100 border-b border-orange-300 px-4 py-2 text-center text-xs text-orange-800" : "hidden"}
    >
      {show ? (
        <>
          Tous les paiements en preview sont en mode test (aucune carte réelle débitée).{" "}
          <a
            href="https://docs.lovable.dev/features/payments#test-and-live-environments"
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium"
          >
            En savoir plus
          </a>
        </>
      ) : null}
    </div>
  );
}
