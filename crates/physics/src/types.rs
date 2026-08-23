use serde::{Deserialize, Serialize};

/// World axes: +y down the pitch toward the batter, +x off-side of a
/// right-hand batter (screen-right), +z up.
pub const PITCH_LENGTH: f64 = 20.12;
pub const STUMPS_HALF_WIDTH: f64 = 0.114;
pub const STUMPS_HEIGHT: f64 = 0.711;
pub const BALL_MASS: f64 = 0.160;
pub const BALL_DIAMETER: f64 = 0.0726;
pub const BALL_RADIUS: f64 = BALL_DIAMETER / 2.0;
pub const AIR_DENSITY: f64 = 1.20;
pub const AIR_VISCOSITY: f64 = 1.81e-5;
pub const GRAVITY: f64 = 9.81;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SwingRegime {
    Conventional,
    Reverse,
    ContrastRough,
    ContrastShine,
    Dead,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Outcome {
    Bowled,
    Lbw,
    Beaten,
    Defended,
    Edged,
    Left,
    Wide,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BowlInput {
    /// Pace in kilometres per hour (115–155).
    pub pace_kph: f64,
    /// Aimed line at the popping crease, metres from middle (+ off, − leg).
    pub line_m: f64,
    /// Aimed pitch length as metres short of the batting stumps (0.2 yorker … 12 short).
    pub length_m: f64,
    /// Seam yaw in degrees. Positive points toward the slips (conventional outswing).
    pub seam_angle_deg: f64,
    /// 0 = scrambled / floppy wrist, 1 = seam locked upright.
    pub seam_upright: f64,
    /// 0 = wrist beside the ball, 1 = wrist fully behind it (gyroscopic stability).
    pub wrist_behind: f64,
    /// Wear on the rough hemisphere, 0–1.
    pub roughness: f64,
    /// Polish on the shiny hemisphere, 0–1.
    pub shine: f64,
    /// Which hemisphere is rough: `"off"` or `"leg"`.
    pub rough_side: String,
    /// How proud the primary seam stands, 0–1.
    #[serde(default = "default_seam_prominence")]
    pub seam_prominence: f64,
    /// Backspin in revolutions per second. Typical swing bowling is ~11.
    #[serde(default = "default_backspin")]
    pub backspin_rps: f64,
}

fn default_seam_prominence() -> f64 {
    0.85
}

fn default_backspin() -> f64 {
    11.0
}

impl BowlInput {
    pub fn clamped(mut self) -> Self {
        self.pace_kph = self.pace_kph.clamp(105.0, 160.0);
        self.line_m = self.line_m.clamp(-0.85, 0.85);
        self.length_m = self.length_m.clamp(0.15, 13.0);
        self.seam_angle_deg = self.seam_angle_deg.clamp(-35.0, 35.0);
        self.seam_upright = self.seam_upright.clamp(0.0, 1.0);
        self.wrist_behind = self.wrist_behind.clamp(0.0, 1.0);
        self.roughness = self.roughness.clamp(0.0, 1.0);
        self.shine = self.shine.clamp(0.0, 1.0);
        self.seam_prominence = self.seam_prominence.clamp(0.15, 1.0);
        self.backspin_rps = self.backspin_rps.clamp(4.0, 16.0);
        if self.rough_side != "leg" {
            self.rough_side = "off".into();
        }
        self
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sample {
    pub t: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub vx: f64,
    pub vy: f64,
    pub vz: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AeroReport {
    pub regime: SwingRegime,
    pub reynolds: f64,
    pub speed_mph: f64,
    pub side_coeff: f64,
    pub drag_coeff: f64,
    pub swing_direction: f64,
    pub reverse_onset_mph: f64,
    pub dead_zone_mph: f64,
    pub laminar_separation_bubble: bool,
    pub seam_separation_deg: f64,
    pub non_seam_separation_deg: f64,
    pub late_deviation_m: f64,
    pub commentary: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BowlResult {
    pub input: BowlInput,
    pub aero: AeroReport,
    pub samples: Vec<Sample>,
    pub bounce: Option<[f64; 3]>,
    pub stump_pass: Option<[f64; 3]>,
    pub outcome: Outcome,
    pub wickets: bool,
    pub wide: bool,
    pub score: i32,
    /// Line the RHB committed to after reading the early hoop.
    #[serde(default)]
    pub batter_commit_x: f64,
    /// Front-foot plant toward the pitch of the ball.
    #[serde(default)]
    pub batter_foot_y: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Challenge {
    pub id: &'static str,
    pub title: &'static str,
    pub patron: &'static str,
    pub blurb: &'static str,
    pub hint: &'static str,
    pub target_regime: SwingRegime,
    pub min_pace_kph: f64,
    pub max_length_m: f64,
    pub require_wicket: bool,
    pub min_deviation_m: f64,
}

pub fn challenges() -> Vec<Challenge> {
    vec![
        Challenge {
            id: "sarfraz",
            title: "Sarfraz's Discovery",
            patron: "Sarfraz Nawaz",
            blurb: "Trial and error on abrasive Pakistani pitches. Get an old ball to reverse — the 'wrong way' — by at least a stump's width.",
            hint: "Rough one side, keep the other shiny, seam angled, and push through 138kph+.",
            target_regime: SwingRegime::Reverse,
            min_pace_kph: 136.0,
            max_length_m: 8.0,
            require_wicket: false,
            min_deviation_m: 0.11,
        },
        Challenge {
            id: "imran",
            title: "Imran's Karachi Spell",
            patron: "Imran Khan",
            blurb: "Karachi, 1982. Same outswing action, old ball, sudden away movement. Reverse must oppose the seam.",
            hint: "Seam toward fine leg (negative), high pace, worn rough side. The ball should leave the right-hander.",
            target_regime: SwingRegime::Reverse,
            min_pace_kph: 140.0,
            max_length_m: 7.5,
            require_wicket: false,
            min_deviation_m: 0.16,
        },
        Challenge {
            id: "waqar",
            title: "Waqar's Toe-Crusher",
            patron: "Waqar Younis",
            blurb: "The late reverse-inswing yorker that made tailenders hop. Pitch it at the toes and hit the stumps.",
            hint: "Yorker length, 145kph, seam toward slips, old ball. Reverse brings it back into middle.",
            target_regime: SwingRegime::Reverse,
            min_pace_kph: 143.0,
            max_length_m: 1.4,
            require_wicket: true,
            min_deviation_m: 0.08,
        },
        Challenge {
            id: "wasim",
            title: "Wasim's Late Leave",
            patron: "Wasim Akram",
            blurb: "Wrist behind the ball, seam upright, and the late hoop that starts after the batter commits.",
            hint: "Lock the wrist, keep the seam proud, full-good length, and let reverse finish late.",
            target_regime: SwingRegime::Reverse,
            min_pace_kph: 141.0,
            max_length_m: 6.2,
            require_wicket: false,
            min_deviation_m: 0.20,
        },
        Challenge {
            id: "contrast",
            title: "Contrast Class",
            patron: "Rabindra Mehta",
            blurb: "Seam straight down the pitch. Swing comes from shine versus roughness, not seam angle. NASA science, club-bowler grip.",
            hint: "Seam near 0°, strong shine/rough contrast. Slow swings to rough; very fast swings to shine.",
            target_regime: SwingRegime::ContrastShine,
            min_pace_kph: 120.0,
            max_length_m: 8.0,
            require_wicket: false,
            min_deviation_m: 0.12,
        },
    ]
}

pub fn lore() -> Vec<(&'static str, &'static str)> {
    vec![
        (
            "origin",
            "Reverse swing grew on Pakistan's dry, abrasive pitches — possibly as early as the late 1940s — then was patented in international cricket by Sarfraz Nawaz and Imran Khan, and perfected by Wasim Akram and Waqar Younis.",
        ),
        (
            "conventional",
            "Between about 30 and 70mph the seam trips one boundary layer into turbulence. That side stays attached longer (~120°) than the laminar side (~80°). Lower pressure follows the turbulent side, so the ball swings the way the seam points.",
        ),
        (
            "reverse",
            "Above a critical speed the non-seam side is already turbulent before the seam. The seam then thickens and weakens that layer so it separates early. A laminar separation bubble on the rough non-seam side delays separation there. Pressure asymmetry flips: the ball swings against the seam.",
        ),
        (
            "contrast",
            "With the seam upright, shine versus roughness alone can swing the ball: toward the rough side at modest pace, toward the shiny side once both layers are turbulent.",
        ),
        (
            "myth",
            "Wetting one side to unbalance the ball does not cause reverse swing. Late hoop is built into a parabolic side-force path — most of the metres appear in the second half of flight.",
        ),
    ]
}
