import { useState } from "react";

export function PlantillaBase() {
  const [openstate, setOpenState] = useState(false);
  return (
    <div className="min-h-screen p-4 w-full bg-white dark:bg-slate-900 text-slate-800 dark:text-white grid gap-4 grid-area"
    >
      <header className="flex items-center mb-5 grid-area-header"></header>
      <section className="grid-area-area1"></section>
      <section className="grid-area-area2"></section>
      <section className="grid-area-main"></section>
    </div>
  );
}

export default PlantillaBase;