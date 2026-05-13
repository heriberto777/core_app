import { useState } from "react";

export function PlantillaBase() {
  const [openstate, setOpenState] = useState(false);
  return (
    <div className="min-h-screen p-4 w-full bg-white dark:bg-slate-900 text-slate-800 dark:text-white grid gap-4"
      style={{
        gridTemplate: `
          "header" 90px
          "area1" 50px
          "area2" 80px
          "main" auto
        / 1fr`
      }}
    >
      <header className="flex items-center mb-5" style={{ gridArea: 'header' }}>
      </header>
      <section style={{ gridArea: 'area1' }}></section>
      <section style={{ gridArea: 'area2' }}></section>
      <section style={{ gridArea: 'main' }}></section>
    </div>
  );
}

export default PlantillaBase;