import { CINDY_GM, findAgent } from "./agents";
import { AgentFace } from "./characters";
import { presenceFor, resolveTod, spotFor } from "./sim";
import type { OfficeTask } from "./types";

const SPOTS: Record<string, { x: number; y: number }> = {
  cindy: { x: 18, y: 30 },
  maggieOffice: { x: 42, y: 28 },
  meet: { x: 52, y: 50 },
  amy: { x: 22, y: 64 },
  lily: { x: 40, y: 70 },
  ken: { x: 66, y: 62 },
  ivy: { x: 78, y: 46 },
  lounge: { x: 30, y: 84 },
  kitchen: { x: 76, y: 82 },
};

const PEOPLE = ["cindy", "maggie", "amy", "lily", "ken", "ivy"];

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
  const placed = PEOPLE.map((slug) => {
    const spot = spotFor(slug, tasks, day, walks[slug]);
    return { slug, spot };
  });
  const crowds = new Map<string, string[]>();
  for (const person of placed) {
    const list = crowds.get(person.spot) ?? [];
    list.push(person.slug);
    crowds.set(person.spot, list);
  }

  return (
    <div className={`stage tod-${light}`} data-testid="office-stage">
      <div className="windows" aria-hidden="true">
        <div className="skyline" />
        <span className="pane" />
        <span className="pane" />
        <span className="pane" />
        <span className="pane" />
      </div>
      <div className="floor">
        <div className="glass gm">
          <span>總經理室</span>
        </div>
        <div className="glass lead">
          <span>主管室</span>
        </div>
        <div className="table">
          <span>會議桌</span>
        </div>
        <i className="rug amy" />
        <i className="rug lily" />
        <i className="rug ken" />
        <i className="rug ivy" />
        <i className="desk d1" />
        <i className="desk d2" />
        <i className="desk d3" />
        <i className="desk d4" />
        <div className="sofa">沙發休息區</div>
        <div className="kitchen">茶水間</div>
        <i className="plant p1" />
        <i className="plant p2" />
        <i className="plant p3" />
        {placed.map((person) => {
          const base = SPOTS[person.spot] ?? SPOTS.lounge;
          const crowd = crowds.get(person.spot) ?? [person.slug];
          const index = crowd.indexOf(person.slug);
          const agent = person.slug === "cindy" ? CINDY_GM : findAgent(person.slug);
          const presence = presenceFor(person.slug, tasks, day);
          const x = base.x + (index - (crowd.length - 1) / 2) * 7;
          const y = base.y + index * 2;
          return (
            <button
              key={person.slug}
              type="button"
              className={`actor${selected === person.slug ? " is-selected" : ""}${presence === "working" ? " is-working" : ""}${walks[person.slug] ? " is-walking" : ""}`}
              style={{ left: `${x}%`, top: `${y}%`, zIndex: Math.round(y) }}
              onClick={() => onSelect(person.slug)}
            >
              {bubbles[person.slug] && <span className="say">{bubbles[person.slug]}</span>}
              {!bubbles[person.slug] && presence === "thinking" && <span className="say think">想一下</span>}
              <AgentFace slug={person.slug} />
              <span className="nametag" style={{ background: agent.accent }}>
                {agent.display_name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
