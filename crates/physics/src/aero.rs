use crate::types::{BowlInput, SwingRegime, AIR_DENSITY, AIR_VISCOSITY, BALL_DIAMETER};

#[derive(Debug, Clone)]
pub struct AeroState {
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
}

pub fn classify(input: &BowlInput, speed_mps: f64) -> AeroState {
    let speed_mps = speed_mps.max(1.0);
    let reynolds = AIR_DENSITY * speed_mps * BALL_DIAMETER / AIR_VISCOSITY;
    let speed_mph = speed_mps * 2.23694;

    let leading_rough = leading_roughness(input);
    // Mehta: new-ball reverse ~85mph, dead zone ~80mph. Roughness on the
    // leading face drops both thresholds so club pace can reverse an old ball.
    let dead_zone_mph = (80.0 - 20.0 * leading_rough).clamp(58.0, 82.0);
    let reverse_onset_mph = (85.0 - 24.0 * leading_rough).clamp(62.0, 90.0);

    let seam = input.seam_angle_deg;
    let contrast = seam.abs() < 4.5;

    let (regime, swing_direction) = if contrast {
        contrast_regime(input, speed_mph, dead_zone_mph)
    } else {
        seamed_regime(seam, speed_mph, dead_zone_mph, reverse_onset_mph)
    };

    let seam_efficiency = seam_efficiency(seam, contrast, input.seam_prominence);
    let stability = (0.28 + 0.72 * input.wrist_behind) * (0.35 + 0.65 * input.seam_upright);
    let surface = 0.55 + 0.45 * (input.shine + input.roughness).min(2.0) / 2.0;
    let contrast_boost = 1.0 + 0.35 * (input.shine - input.roughness).abs();

    let mut side_coeff = 0.30 * seam_efficiency * stability * surface * contrast_boost;
    match regime {
        SwingRegime::Dead => side_coeff *= 0.08,
        SwingRegime::Reverse => side_coeff *= 0.92 + 0.22 * leading_rough,
        SwingRegime::ContrastShine => side_coeff *= 0.78,
        SwingRegime::ContrastRough => side_coeff *= 0.86,
        SwingRegime::Conventional => side_coeff *= 0.70 + 0.30 * input.shine,
    }
    side_coeff = side_coeff.clamp(0.0, 0.42) * swing_direction.abs();

    let turbulent = matches!(
        regime,
        SwingRegime::Reverse | SwingRegime::ContrastShine | SwingRegime::Dead
    );
    let drag_coeff = if turbulent { 0.41 } else { 0.49 };

    let lsb = matches!(
        regime,
        SwingRegime::Reverse | SwingRegime::ContrastShine
    );
    let (seam_sep, non_seam_sep) = separation_angles(regime, lsb);

    AeroState {
        regime,
        reynolds,
        speed_mph,
        side_coeff: side_coeff * swing_direction.signum().abs().max(0.0)
            * if swing_direction == 0.0 { 0.0 } else { 1.0 },
        drag_coeff,
        swing_direction,
        reverse_onset_mph,
        dead_zone_mph,
        laminar_separation_bubble: lsb,
        seam_separation_deg: seam_sep,
        non_seam_separation_deg: non_seam_sep,
    }
}

fn leading_roughness(input: &BowlInput) -> f64 {
    // The non-seam / leading face is the one the batter sees. Roughness
    // there is what drops the reverse-swing critical speed.
    let rough_is_off = input.rough_side != "leg";
    let seam_to_off = input.seam_angle_deg >= 0.0;
    if rough_is_off == seam_to_off {
        input.roughness * 0.45 + (1.0 - input.shine) * 0.25
    } else {
        input.roughness
    }
}

fn contrast_regime(input: &BowlInput, speed_mph: f64, dead_zone_mph: f64) -> (SwingRegime, f64) {
    let rough_sign = if input.rough_side == "leg" { -1.0 } else { 1.0 };
    if speed_mph < dead_zone_mph {
        (SwingRegime::ContrastRough, rough_sign)
    } else {
        (SwingRegime::ContrastShine, -rough_sign)
    }
}

fn seamed_regime(
    seam: f64,
    speed_mph: f64,
    dead_zone_mph: f64,
    reverse_onset_mph: f64,
) -> (SwingRegime, f64) {
    let seam_dir = if seam >= 0.0 { 1.0 } else { -1.0 };
    if speed_mph < dead_zone_mph {
        (SwingRegime::Conventional, seam_dir)
    } else if speed_mph < reverse_onset_mph {
        (SwingRegime::Dead, 0.0)
    } else {
        (SwingRegime::Reverse, -seam_dir)
    }
}

fn seam_efficiency(seam: f64, contrast: bool, prominence: f64) -> f64 {
    if contrast {
        return 0.62 * prominence;
    }
    let abs = seam.abs();
    let peak = 20.0;
    let shape = if abs <= peak {
        (abs / peak).powf(0.65)
    } else {
        (1.0 - (abs - peak) / 22.0).clamp(0.15, 1.0)
    };
    shape * (0.45 + 0.55 * prominence)
}

fn separation_angles(regime: SwingRegime, lsb: bool) -> (f64, f64) {
    match regime {
        SwingRegime::Conventional => (120.0, 80.0),
        SwingRegime::Reverse => (95.0, if lsb { 128.0 } else { 110.0 }),
        SwingRegime::ContrastRough => (100.0, 125.0),
        SwingRegime::ContrastShine => (122.0, 98.0),
        SwingRegime::Dead => (108.0, 108.0),
    }
}

pub fn commentary(input: &BowlInput, state: &AeroState, late_dev: f64) -> String {
    let cm = (late_dev * 100.0).round().abs();
    match state.regime {
        SwingRegime::Reverse => format!(
            "Reverse. The seam said {}, the old ball went the other way — {cm:.0}cm of late hoop. LSB on the non-seam face.",
            if input.seam_angle_deg >= 0.0 { "away" } else { "in" }
        ),
        SwingRegime::Conventional => format!(
            "Conventional swing with the seam. Shiny-side laminar hold, {cm:.0}cm toward the slips/fine-leg line."
        ),
        SwingRegime::ContrastShine => format!(
            "Contrast swing toward the shiny side at {0:.0}mph. Seam upright — Mehta's third kind.",
            state.speed_mph
        ),
        SwingRegime::ContrastRough => format!(
            "Contrast swing toward the rough side. Same grip as a stock seamer; the two-tone ball does the rest."
        ),
        SwingRegime::Dead => {
            "Dead zone. Both layers are transitional — no useful pressure difference. Faster, rougher, or slower."
                .into()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn base() -> BowlInput {
        BowlInput {
            pace_kph: 145.0,
            line_m: 0.12,
            length_m: 0.6,
            seam_angle_deg: 18.0,
            seam_upright: 0.9,
            wrist_behind: 0.85,
            roughness: 0.75,
            shine: 0.85,
            rough_side: "off".into(),
            seam_prominence: 0.9,
            backspin_rps: 11.0,
        }
    }

    #[test]
    fn old_ball_fast_reverses_against_seam() {
        let input = base();
        let state = classify(&input, input.pace_kph / 3.6);
        assert_eq!(state.regime, SwingRegime::Reverse);
        assert!(state.swing_direction < 0.0);
        assert!(state.laminar_separation_bubble);
    }

    #[test]
    fn new_ball_medium_is_conventional() {
        let mut input = base();
        input.pace_kph = 118.0;
        input.roughness = 0.08;
        input.shine = 0.95;
        let state = classify(&input, input.pace_kph / 3.6);
        assert_eq!(state.regime, SwingRegime::Conventional);
        assert!(state.swing_direction > 0.0);
    }
}
