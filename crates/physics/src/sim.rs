use crate::aero::{classify, commentary, AeroState};
use crate::types::{
    AeroReport, BowlInput, BowlResult, Outcome, Sample, BALL_MASS, BALL_RADIUS, GRAVITY,
    PITCH_LENGTH, STUMPS_HALF_WIDTH, STUMPS_HEIGHT, AIR_DENSITY, BALL_DIAMETER,
};

const DT: f64 = 0.002;
const RELEASE_Z: f64 = 2.08;
const RELEASE_Y: f64 = 0.0;
const MAX_T: f64 = 1.6;

pub fn simulate(raw: BowlInput) -> BowlResult {
    let input = raw.clamped();
    let speed = input.pace_kph / 3.6;
    let launch = launch_velocity(&input, speed);

    let mut x = input.line_m * 0.15;
    let mut y = RELEASE_Y;
    let mut z = RELEASE_Z;
    let mut vx = launch[0];
    let mut vy = launch[1];
    let mut vz = launch[2];

    let mut samples = Vec::with_capacity(800);
    let mut bounce = None;
    let mut stump_pass = None;
    let mut t = 0.0;
    let mut bounced = false;
    let mut steps = 0usize;
    let mut early_x = x;

    samples.push(Sample {
        t,
        x,
        y,
        z,
        vx,
        vy,
        vz,
    });

    while t < MAX_T && y < PITCH_LENGTH + 1.4 && samples.len() < 900 {
        let speed_now = (vx * vx + vy * vy + vz * vz).sqrt().max(1.0);
        let aero = classify(&input, speed_now);
        let area = std::f64::consts::PI * (BALL_DIAMETER * 0.5).powi(2);
        let q = 0.5 * AIR_DENSITY * speed_now * speed_now * area;

        let drag = q * aero.drag_coeff;
        // Game-feel scale: published Cs is modest; we keep the sign of the
        // science and let the hoop read on a 20-yard canvas.
        let side = q * aero.side_coeff * aero.swing_direction * 0.52;
        let spin = input.backspin_rps * std::f64::consts::TAU;
        let mag_cl = (0.012 * spin / speed_now.max(8.0)).clamp(0.0, 0.22);
        let lift = q * mag_cl;

        let fx = -drag * vx / speed_now + side;
        let fy = -drag * vy / speed_now;
        let fz = -drag * vz / speed_now + lift - BALL_MASS * GRAVITY;

        vx += (fx / BALL_MASS) * DT;
        vy += (fy / BALL_MASS) * DT;
        vz += (fz / BALL_MASS) * DT;
        x += vx * DT;
        y += vy * DT;
        z += vz * DT;
        t += DT;
        steps += 1;

        if y >= PITCH_LENGTH * 0.38 && y <= PITCH_LENGTH * 0.42 {
            early_x = x;
        }

        if !bounced && z <= BALL_RADIUS && vz < 0.0 {
            z = BALL_RADIUS;
            vz = -vz * 0.46;
            vx *= 0.82;
            vy *= 0.88;
            bounced = true;
            bounce = Some([x, y, z]);
        }

        if stump_pass.is_none() && y >= PITCH_LENGTH {
            stump_pass = Some([x, y, z]);
        }

        if steps % 3 == 0 || y >= PITCH_LENGTH {
            samples.push(Sample {
                t,
                x,
                y,
                z,
                vx,
                vy,
                vz,
            });
        }
    }

    let late_x = stump_pass.map(|p| p[0]).unwrap_or(x);
    let late_deviation_m = late_x - early_x;

    let aero_now = classify(&input, speed);
    let aero = report(&input, &aero_now, late_deviation_m);
    let (outcome, wickets, wide, score) =
        judge(&input, bounce, stump_pass, late_deviation_m, aero.regime);

    BowlResult {
        input,
        aero,
        samples,
        bounce,
        stump_pass,
        outcome,
        wickets,
        wide,
        score,
    }
}

fn launch_velocity(input: &BowlInput, speed: f64) -> [f64; 3] {
    let target_y = (PITCH_LENGTH - input.length_m).clamp(5.5, PITCH_LENGTH - 0.08);
    let mut lo = -0.22_f64;
    let mut hi = 0.02_f64;
    let mut pitch = -0.06;
    for _ in 0..14 {
        pitch = 0.5 * (lo + hi);
        if drag_bounce_y(speed, pitch) < target_y {
            lo = pitch;
        } else {
            hi = pitch;
        }
    }
    let yaw = (input.line_m / target_y).atan() * 0.35;
    let cy = pitch.cos();
    [
        speed * cy * yaw.sin(),
        speed * cy * yaw.cos(),
        speed * pitch.sin(),
    ]
}

fn drag_bounce_y(speed: f64, pitch: f64) -> f64 {
    let area = std::f64::consts::PI * (BALL_DIAMETER * 0.5).powi(2);
    let mut y = 0.0;
    let mut z = RELEASE_Z;
    let mut vy = speed * pitch.cos();
    let mut vz = speed * pitch.sin();
    for _ in 0..900 {
        let sp = (vy * vy + vz * vz).sqrt().max(1.0);
        let q = 0.5 * AIR_DENSITY * sp * sp * area;
        let drag = q * 0.45;
        vy -= (drag * vy / sp / BALL_MASS) * DT;
        vz -= (drag * vz / sp / BALL_MASS + GRAVITY) * DT;
        y += vy * DT;
        z += vz * DT;
        if z <= BALL_RADIUS {
            return y;
        }
        if y > 30.0 {
            return y;
        }
    }
    y
}

fn report(input: &BowlInput, state: &AeroState, late_dev: f64) -> AeroReport {
    AeroReport {
        regime: state.regime,
        reynolds: state.reynolds,
        speed_mph: state.speed_mph,
        side_coeff: state.side_coeff * state.swing_direction.abs(),
        drag_coeff: state.drag_coeff,
        swing_direction: state.swing_direction,
        reverse_onset_mph: state.reverse_onset_mph,
        dead_zone_mph: state.dead_zone_mph,
        laminar_separation_bubble: state.laminar_separation_bubble,
        seam_separation_deg: state.seam_separation_deg,
        non_seam_separation_deg: state.non_seam_separation_deg,
        late_deviation_m: late_dev,
        commentary: commentary(input, state, late_dev),
    }
}

fn judge(
    input: &BowlInput,
    bounce: Option<[f64; 3]>,
    stump_pass: Option<[f64; 3]>,
    late_dev: f64,
    regime: crate::SwingRegime,
) -> (Outcome, bool, bool, i32) {
    let Some(pass) = stump_pass else {
        return (Outcome::Left, false, true, -8);
    };
    let (px, _, pz) = (pass[0], pass[1], pass[2]);
    let wide = px.abs() > 0.72 && pz < 1.4;
    if wide {
        return (Outcome::Wide, false, true, -10);
    }

    let hits_stumps = px.abs() <= STUMPS_HALF_WIDTH + BALL_RADIUS && pz <= STUMPS_HEIGHT + BALL_RADIUS;
    let full_yorker = bounce
        .map(|b| PITCH_LENGTH - b[1] < 1.35)
        .unwrap_or(false)
        || bounce.is_none();

    if hits_stumps {
        let bonus = ((late_dev.abs() * 80.0) as i32).min(25);
        return (Outcome::Bowled, true, false, 50 + bonus);
    }

    let pad_line = px.abs() < 0.22 && pz < 0.55 && bounce.is_some() && !full_yorker;
    if pad_line && late_dev.abs() > 0.07 {
        return (Outcome::Lbw, true, false, 40 + (late_dev.abs() * 40.0) as i32);
    }

    // Batter plays the original line. Late reverse beats the bat.
    let commit_error = late_dev.abs();
    if commit_error > 0.13 {
        let bonus = if matches!(regime, crate::SwingRegime::Reverse) {
            8
        } else {
            0
        };
        return (Outcome::Beaten, false, false, 16 + bonus);
    }
    if input.length_m < 1.2 && commit_error > 0.07 {
        return (Outcome::Beaten, false, false, 14);
    }
    (Outcome::Defended, false, false, 5)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::SwingRegime;

    #[test]
    fn waqar_yorker_can_hit() {
        let result = simulate(BowlInput {
            pace_kph: 147.0,
            line_m: 0.18,
            length_m: 0.45,
            seam_angle_deg: 20.0,
            seam_upright: 0.92,
            wrist_behind: 0.9,
            roughness: 0.8,
            shine: 0.88,
            rough_side: "off".into(),
            seam_prominence: 0.92,
            backspin_rps: 11.5,
        });
        assert_eq!(result.aero.regime, SwingRegime::Reverse);
        assert!(!result.samples.is_empty());
        assert!(result.aero.late_deviation_m.abs() > 0.02);
        let bounce_y = result.bounce.map(|b| b[1]).unwrap_or(0.0);
        assert!(
            bounce_y > 16.0,
            "yorker should pitch near the stumps, got {bounce_y}"
        );
    }
}
