import { useEffect, useState } from "react";
import { CINDY_GM, findAgent } from "./agents";
import { PRESENCE_LABEL, presenceFor, resolveTod, spotFor } from "./sim";
import type { Presence } from "./sim";
import type { OfficeTask } from "./types";

const SPOTS: Record<string, { x: number; y: number }> = {
  cindy: { x: 16, y: 38 },
  maggieOffice: { x: 38, y: 36 },
  kitchen: { x: 86, y: 36 },
  whiteboard: { x: 62, y: 42 },
  amy: { x: 14, y: 68 },
  lily: { x: 36, y: 72 },
  ken: { x: 58, y: 70 },
  ivy: { x: 80, y: 66 },
  lounge: { x: 30, y: 88 },
  meet: { x: 48, y: 84 },
  servers: { x: 86, y: 86 },
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
      <div className="floor" aria-hidden="true">
        <i className="zone zone-gm" />
        <i className="zone zone-lead" />
        <i className="zone zone-amy" />
        <i className="zone zone-lily" />
        <i className="zone zone-ken" />
        <i className="zone zone-ivy" />
        <i className="zone zone-lounge" />
        <span className="plate plate-gm">總經理座位</span>
        <span className="plate plate-lead">主管座位</span>
        <Prop file="desk.png" className="big at-gm" />
        <Prop file="chair.png" className="at-gm-chair" />
        <Prop file="lamp.png" className="at-gm-lamp" />
        <Prop file="desk.png" className="big at-lead" />
        <Prop file="bookcase.png" className="at-lead-books" />
        <Prop file="desk.png" className="at-amy" />
        <Prop file="monitor.png" className="at-amy-screen" />
        <Prop file="desk.png" className="at-lily" />
        <Prop file="books.png" className="at-lily-books" />
        <Prop file="desk.png" className="at-ken" />
        <Prop file="monitor.png" className="at-ken-screen" />
        <Prop file="desk.png" className="at-ivy" />
        <Prop file="lounge-chair.png" className="at-ivy-chair" />
        <Prop file="sofa.png" className="at-sofa" />
        <Prop file="coffee-table.png" className="at-table" />
        <Prop file="plant.png" className="at-plant-a" />
        <Prop file="plant-small.png" className="at-plant-b" />
        <Prop file="coffee.png" className="at-coffee" />
        <img className="prop at-cooler" alt="" src={asset("sprites/cooler.png")} />
        <img className="prop board at-board" alt="" src={asset("sprites/board.png")} />
        <img className="prop at-rack" alt="" src={asset("sprites/rack.png")} />
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
