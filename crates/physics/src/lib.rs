//! Cricket-ball swing physics grounded in published aerodynamics.
//!
//! Conventional, reverse, and contrast swing follow Rabindra Mehta's
//! wind-tunnel picture and the laminar-separation-bubble mechanism
//! reported by Scobie, Deshpande, and others. Pakistani fast bowlers —
//! Sarfraz Nawaz, Imran Khan, then Wasim Akram and Waqar Younis —
//! turned that flow regime into a weapon on dry, abrasive pitches.

mod aero;
mod sim;
mod types;

pub use aero::{classify, AeroState};
pub use sim::simulate;
pub use types::*;
