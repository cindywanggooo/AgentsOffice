import { useEffect, useState } from "react";
import { CINDY_GM, findAgent } from "./agents";
import { PRESENCE_LABEL, presenceFor, resolveTod, spotFor } from "./sim";
import type { Presence } from "./sim";
import type { OfficeTask } from "./types";

const SPOTS: Record<string, { x: number; y: number }> = {
  cindy: { x: 17, y: 32 },
  maggieOffice: { x: 50, y: 32 },
  kitchen: { x: 83, y: 32 },
  whiteboard: { x: 50, y: 46 },
  amy: { x: 17, y: 58 },
  lily: { x: 50, y: 58 },
  ken: { x: 83, y: 58 },
  ivy: { x: 17, y: 84 },
  lounge: { x: 50, y: 84 },
  meet: { x: 50, y: 70 },
  servers: { x: 83, y: 84 },
};

const PEOPLE = ["cindy", "maggie", "amy", "lily", "ken", "ivy"];
const CAT_PATH = ["kitchen", "amy", "lounge", "servers", "ivy", "lily"];
const SHORT_ROLE: Record<string, string> = {
  cindy: "總經理",
  maggie: "主管",
  amy: "自媒體",
  lily: "研究",
  ken: "資安",
  ivy: "美編",
};

function asset(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

function Prop({ file, className }: { file: string; className?: string }) {
  return <img className={className ? `prop ${className}` : "prop"} alt="" src={asset(`furniture/${file}`)} />;
}

interface SceneProps {
  tasks: OfficeTask[];
  day: string;
  walks: Record<string, string>;
  bubbles: Record<string, string>;
  selected: string;
  onSelect: (slug: string) => void;
  tod: "now" | "day" | "dusk" | "night";
}

export function OfficeScene({ tasks, day, walks, bubbles, selected, onSelect, tod }: SceneProps) {
  const light = resolveTod(tod);
  const [catStep, setCatStep] = useState(0);
  const [hop, setHop] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      setCatStep((step) => {
        const next = (step + 1) % CAT_PATH.length;
        const spot = CAT_PATH[next];
        setHop(spot === "amy" || spot === "lily" || spot === "ivy");
        return next;
      });
    }, 2800);
    return () => window.clearInterval(id);
  }, []);

  const placed = PEOPLE.map((slug) => ({ slug, spot: spotFor(slug, tasks, day, walks[slug]) }));
  const crowds = new Map<string, string[]>();
  for (const person of placed) {
    const list = crowds.get(person.spot) ?? [];
    list.push(person.slug);
    crowds.set(person.spot, list);
  }
  const catSpot = SPOTS[CAT_PATH[catStep]] ?? SPOTS.lounge;

  return (
    <div className={`stage tod-${light}`} data-testid="office-stage">
      <div className="city" aria-hidden="true">
        <div className="skyline" />
        <img className="neon" alt="" src={asset("sprites/neon.png")} />
      </div>
      <div className="rooms" aria-hidden="true">
        <section className="cell gm carpet-brown">
          <span className="plate">總經理室</span>
          <Prop file="desk.png" />
          <Prop file="chair.png" />
          <Prop file="lamp.png" />
        </section>
        <section className="cell lead carpet-green">
          <span className="plate">主管室</span>
          <Prop file="desk.png" />
          <Prop file="bookcase.png" />
          <Prop file="plant.png" />
        </section>
        <section className="cell kitchen carpet-navy">
          <span className="plate">茶水間</span>
          <Prop file="cabinet.png" />
          <Prop file="coffee.png" />
          <img className="prop tiny" alt="" src={asset("sprites/cooler.png")} />
        </section>
        <section className="cell amy carpet-purple">
          <span className="plate">Amy</span>
          <Prop file="rug.png" />
          <Prop file="desk.png" />
          <Prop file="monitor.png" />
          <Prop file="plant-small.png" />
        </section>
        <section className="cell lily carpet-teal">
          <span className="plate">Lily</span>
          <Prop file="rug.png" />
          <Prop file="desk.png" />
          <Prop file="books.png" />
          <Prop file="lamp.png" />
        </section>
        <section className="cell ken carpet-maroon">
          <span className="plate">Ken</span>
          <Prop file="rug.png" />
          <Prop file="desk.png" />
          <Prop file="monitor.png" />
          <Prop file="side-table.png" />
        </section>
        <section className="cell ivy carpet-amber">
          <span className="plate">Ivy</span>
          <Prop file="rug.png" />
          <Prop file="desk.png" />
          <Prop file="lounge-chair.png" />
          <Prop file="plant.png" />
        </section>
        <section className="cell lounge carpet-olive">
          <span className="plate">休息區</span>
          <Prop file="sofa.png" />
          <Prop file="coffee-table.png" />
          <img className="prop board" alt="" src={asset("sprites/board.png")} />
        </section>
        <section className="cell servers carpet-ink">
          <span className="plate">機房</span>
          <img className="prop" alt="" src={asset("sprites/rack.png")} />
          <img className="prop" alt="" src={asset("sprites/rack.png")} />
          <Prop file="plant-small.png" />
        </section>
      </div>
      {placed.map((person) => {
        const base = SPOTS[person.spot] ?? SPOTS.lounge;
        const crowd = crowds.get(person.spot) ?? [person.slug];
        const index = crowd.indexOf(person.slug);
        const agent = person.slug === "cindy" ? CINDY_GM : findAgent(person.slug);
        const presence: Presence = presenceFor(person.slug, tasks, day);
        const x = base.x + (index - (crowd.length - 1) / 2) * 6;
        const y = base.y;
        const line = bubbles[person.slug] || PRESENCE_LABEL[presence];
        return (
          <button
            key={person.slug}
            type="button"
            className={`actor${selected === person.slug ? " is-selected" : ""}${presence === "working" ? " is-working" : ""}${walks[person.slug] ? " is-walking" : ""}${bubbles[person.slug] === "+1" ? " is-plus" : ""}`}
            style={{ left: `${x}%`, top: `${y}%`, zIndex: 3 }}
            onClick={() => onSelect(person.slug)}
          >
            <span className={`say${bubbles[person.slug] ? "" : " is-status"}`}>{line}</span>
            <img className="pixel" alt="" src={asset(`sprites/${person.slug}.png`)} />
            <span className="nametag">
              {agent.display_name}
              <small>{SHORT_ROLE[person.slug] ?? agent.role}</small>
            </span>
          </button>
        );
      })}
      <img
        className={`cat${hop ? " is-hop" : ""}`}
        alt=""
        src={asset("sprites/cat.png")}
        style={{ left: `${catSpot.x + 8}%`, top: `${catSpot.y + 4}%` }}
      />
    </div>
  );
}
