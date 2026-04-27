"use client";

import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw } from "lucide-react";

interface NewStoriesBannerProps {
  visible: boolean;
  onLoad:  () => void;
}

export function NewStoriesBanner({ visible, onLoad }: NewStoriesBannerProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="sticky top-[52px] z-20 flex justify-center py-1.5 pointer-events-none"
        >
          <button
            onClick={onLoad}
            className="pointer-events-auto flex items-center gap-1.5 text-xs font-semibold
                       px-3.5 py-1.5 rounded-full shadow-lg
                       bg-accent text-white hover:bg-accent/90
                       transition-colors duration-150"
          >
            <RefreshCw size={11} className="shrink-0" />
            New stories available
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
