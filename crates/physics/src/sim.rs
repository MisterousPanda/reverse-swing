use crate::aero::{classify, commentary, AeroState};
use crate::types::{
    AeroReport, BowlInput, BowlResult, Outcome, Sample, AIR_DENSITY, BALL_DIAMETER, BALL_MASS,
    BALL_RADIUS, GRAVITY, PITCH_LENGTH, STUMPS_HALF_WIDTH, STUMPS_HEIGHT,
};

const DT: f64 = 0.002;
const RELEASE_X: f64 = 0.20;
const RELEASE_Y: f64 = 0.18;
const RELEASE_Z: f64 = 2.08;
const MAX_T: f64 = 1.7;
const BATTER_Y: f64 = PITCH_LENGTH - 1.22;

pub fn simulate(raw: BowlInput) -> BowlResult {
    let input = raw.clamped();
    let speed = input.pace_kph / 3.6;
    let launch = aimed_launch(&input, speed);

    let mut x = RELEASE_X;
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

    while t < MAX_T && y < PITCH_LENGTH + 1.6 && samples.len() < 900 {
        let speed_now = (vx * vx + vy * vy + vz * vz).sqrt().max(1.0);
        let (fx, fy, fz) = forces(&input, vx, vy, vz, speed_now);

        vx += (fx / BALL_MASS) * DT;
        vy += (fy / BALL_MASS) * DT;
        vz += (fz / BALL_MASS) * DT;
        x += vx * DT;
        y += vy * DT;
        z += vz * DT;
        t += DT;
        steps += 1;

        if y >= 7.6 && y <= 8.6 {
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
    let batter_commit_x = early_x.clamp(-0.42, 0.48);
    let batter_foot_y = bounce
        .map(|b| (b[1] - 0.55).clamp(PITCH_LENGTH - 2.4, PITCH_LENGTH - 0.85))
        .unwrap_or(BATTER_Y);
    let (outcome, wickets, wide, score) = judge(
        &input,
        bounce,
        stump_pass,
        late_deviation_m,
        aero.regime,
        batter_commit_x,
        &samples,
    );

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
        batter_commit_x,
        batter_foot_y,
    }
}

/// Iteratively aim so the first bounce lands near the requested line/length.
/// Swing still bends the path; we just launch off a real target instead of
/// ignoring the sliders (the old yaw * 0.35 / line * 0.15 bug).
fn aimed_launch(input: &BowlInput, speed: f64) -> [f64; 3] {
    let target_x = input.line_m;
    let target_y = (PITCH_LENGTH - input.length_m).clamp(7.2, PITCH_LENGTH - 0.10);

    let dx = target_x - RELEASE_X;
    let dy = (target_y - RELEASE_Y).max(4.0);
    let mut yaw = (dx / dy).atan();
    let mut pitch = -0.07_f64;

    for _ in 0..8 {
        let launch = from_angles(speed, pitch, yaw);
        if let Some(b) = fly_bounce(input, launch) {
            pitch -= (0.010 * (b[1] - target_y)).clamp(-0.045, 0.045);
            yaw -= (0.065 * (b[0] - target_x)).clamp(-0.06, 0.06);
            pitch = pitch.clamp(-0.30, 0.04);
            yaw = yaw.clamp(-0.18, 0.18);
        }
    }

    from_angles(speed, pitch, yaw)
}

fn from_angles(speed: f64, pitch: f64, yaw: f64) -> [f64; 3] {
    let cy = pitch.cos();
    [
        speed * cy * yaw.sin(),
        speed * cy * yaw.cos(),
        speed * pitch.sin(),
    ]
}

fn fly_bounce(input: &BowlInput, launch: [f64; 3]) -> Option<[f64; 3]> {
    let mut x = RELEASE_X;
    let mut y = RELEASE_Y;
    let mut z = RELEASE_Z;
    let mut vx = launch[0];
    let mut vy = launch[1];
    let mut vz = launch[2];
    let mut t = 0.0;
    while t < MAX_T && y < PITCH_LENGTH + 0.4 {
        let speed_now = (vx * vx + vy * vy + vz * vz).sqrt().max(1.0);
        let (fx, fy, fz) = forces(input, vx, vy, vz, speed_now);
        vx += (fx / BALL_MASS) * DT;
        vy += (fy / BALL_MASS) * DT;
        vz += (fz / BALL_MASS) * DT;
        x += vx * DT;
        y += vy * DT;
        z += vz * DT;
        t += DT;
        if z <= BALL_RADIUS && vz < 0.0 {
            return Some([x, y, BALL_RADIUS]);
        }
    }
    None
}

fn forces(input: &BowlInput, vx: f64, vy: f64, vz: f64, speed_now: f64) -> (f64, f64, f64) {
    let aero = classify(input, speed_now);
    let area = std::f64::consts::PI * (BALL_DIAMETER * 0.5).powi(2);
    let q = 0.5 * AIR_DENSITY * speed_now * speed_now * area;
    let drag = q * aero.drag_coeff;
    let side = q * aero.side_coeff * aero.swing_direction * 0.52;
    let spin = input.backspin_rps * std::f64::consts::TAU;
    let mag_cl = (0.012 * spin / speed_now.max(8.0)).clamp(0.0, 0.22);
    let lift = q * mag_cl;
    (
        -drag * vx / speed_now + side,
        -drag * vy / speed_now,
        -drag * vz / speed_now + lift - BALL_MASS * GRAVITY,
    )
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
    commit_x: f64,
    samples: &[Sample],
) -> (Outcome, bool, bool, i32) {
    let Some(pass) = stump_pass else {
        return (Outcome::Left, false, true, -8);
    };
    let (px, pz) = (pass[0], pass[2]);
    if px.abs() > 0.74 && pz < 1.55 {
        return (Outcome::Wide, false, true, -10);
    }

    let (hit_bat, bat_err, hit_pad) = contact(commit_x, samples);
    let hits_stumps =
        px.abs() <= STUMPS_HALF_WIDTH + BALL_RADIUS && pz <= STUMPS_HEIGHT + BALL_RADIUS;
    let pitched_outside_leg = bounce.map(|b| b[0] < -STUMPS_HALF_WIDTH - 0.04).unwrap_or(false);
    let impact_in_line = px.abs() <= STUMPS_HALF_WIDTH + 0.08;
    let hoop = ((late_dev.abs() * 80.0) as i32).min(25);
    let reverse_bonus = if matches!(regime, crate::SwingRegime::Reverse) {
        8
    } else {
        0
    };

    if hit_bat {
        if bat_err > 0.075 && (px.abs() > 0.16 || pz > 0.82) {
            return (Outcome::Edged, false, false, 12 + reverse_bonus);
        }
        return (Outcome::Defended, false, false, 5);
    }

    if hit_pad && hits_stumps && impact_in_line && !pitched_outside_leg {
        return (Outcome::Lbw, true, false, 40 + hoop);
    }

    if hits_stumps {
        return (Outcome::Bowled, true, false, 50 + hoop);
    }

    if px > 0.40 && input.length_m > 5.2 && (px - commit_x).abs() > 0.24 && !hit_pad {
        return (Outcome::Left, false, false, 8);
    }

    if late_dev.abs() > 0.12 || (input.length_m < 1.2 && late_dev.abs() > 0.07) {
        return (Outcome::Beaten, false, false, 16 + reverse_bonus);
    }

    (Outcome::Beaten, false, false, 14)
}

/// RHB: body over the committed line, bat covering a shade of off, pad on the
/// original line. Late reverse that starts after the 8m commit beats the shot.
fn contact(commit_x: f64, samples: &[Sample]) -> (bool, f64, bool) {
    let bat_x = commit_x + 0.12;
    let pad_x = commit_x;
    let mut hit_bat = false;
    let mut hit_pad = false;
    let mut bat_err: f64 = 0.20;
    for s in samples {
        if s.y < BATTER_Y - 0.85 || s.y > BATTER_Y + 0.55 {
            continue;
        }
        let dx_bat = (s.x - bat_x).abs();
        if dx_bat < 0.12 && s.z > 0.10 && s.z < 0.95 {
            hit_bat = true;
            bat_err = bat_err.min(dx_bat);
        }
        if (s.x - pad_x).abs() < 0.13 && s.z < 0.52 {
            hit_pad = true;
        }
    }
    (hit_bat, bat_err, hit_pad)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::SwingRegime;

    fn karachi(line_m: f64, length_m: f64) -> BowlInput {
        BowlInput {
            pace_kph: 146.0,
            line_m,
            length_m,
            seam_angle_deg: 20.0,
            seam_upright: 0.9,
            wrist_behind: 0.9,
            roughness: 0.78,
            shine: 0.86,
            rough_side: "off".into(),
            seam_prominence: 0.92,
            backspin_rps: 11.5,
        }
    }

    #[test]
    fn waqar_yorker_can_hit() {
        let result = simulate(BowlInput {
            pace_kph: 147.0,
            line_m: 0.06,
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
            bounce_y > 18.0,
            "yorker should pitch near the stumps, got {bounce_y}"
        );
    }

    #[test]
    fn line_and_length_move_the_bounce() {
        let yorker = simulate(karachi(0.02, 0.55));
        let short_wide = simulate(karachi(0.42, 9.2));
        let full_leg = simulate(karachi(-0.30, 2.6));

        let yb = yorker.bounce.expect("yorker bounce");
        let sb = short_wide.bounce.expect("short bounce");
        let fb = full_leg.bounce.expect("full bounce");

        let yorker_aim_y = PITCH_LENGTH - 0.55;
        let short_aim_y = PITCH_LENGTH - 9.2;
        let full_aim_y = PITCH_LENGTH - 2.6;

        assert!(
            (yb[1] - yorker_aim_y).abs() < 0.70,
            "yorker bounce y {} vs aim {}",
            yb[1],
            yorker_aim_y
        );
        assert!(
            (sb[1] - short_aim_y).abs() < 0.85,
            "short bounce y {} vs aim {}",
            sb[1],
            short_aim_y
        );
        assert!(
            (fb[1] - full_aim_y).abs() < 0.75,
            "full bounce y {} vs aim {}",
            fb[1],
            full_aim_y
        );

        assert!(
            (yb[0] - 0.02).abs() < 0.26,
            "yorker bounce x {} vs middle",
            yb[0]
        );
        assert!(
            sb[0] > 0.18,
            "short-wide should pitch off-side, got {}",
            sb[0]
        );
        assert!(fb[0] < 0.0, "full-leg should pitch leg-side, got {}", fb[0]);

        assert!(
            (sb[1] - yb[1]).abs() > 6.0,
            "short and yorker must pitch metres apart: {} vs {}",
            sb[1],
            yb[1]
        );
        assert!(
            sb[0] - fb[0] > 0.28,
            "wide-off and leg must be laterally distinct: {} vs {}",
            sb[0],
            fb[0]
        );

        println!(
            "PROVE line/length: yorker_middle x={:.3} y={:.3} | short_wide x={:.3} y={:.3} | full_leg x={:.3} y={:.3}",
            yb[0], yb[1], sb[0], sb[1], fb[0], fb[1]
        );
    }
}
