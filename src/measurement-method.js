/* Comparability identifiers, not calibrated confidence or interpretation. */
export const MEASUREMENT_METHOD = Object.freeze({
  wholeFrame: "sog6-whole-frame-v1",
  roiUnion: "sog6-roi-union-v1",
  qiseCorrected: "qise-sclera-corrected-v1",
  /*
   * A sclera-degraded reading (DR-2026-09-28-SCLERA-NOT-A-DEAD-END) has no
   * sclera gains, so its metrics are raw. Stamping it "corrected" would
   * silently mix two measurement methods in one personal baseline, which
   * sameMeasurementMethod exists to prevent. This value is the comparability
   * identifier for uncorrected rows: interpretReading keeps them out of the
   * corrected baseline, and they never compare against corrected rows.
   */
  qiseUncorrected: "qise-sclera-uncorrected-v1",
});

/** Unknown, missing and differently processed measurements never compare. */
export function sameMeasurementMethod(left, right) {
  return Object.values(MEASUREMENT_METHOD).includes(left) && left === right;
}

/** v2 Qi Se rows have a known, unchanged sclera-corrected capture path.
 * This is a narrow legacy mapping, not a default for unversioned records.
 * A present but unknown method must NOT be relabelled by the legacy mapping.
 */
export function qiseMethodOf(record) {
  if (record && Object.hasOwn(record, "methodVersion")) return record.methodVersion;
  if (record && record.scleraValid === false) return MEASUREMENT_METHOD.qiseUncorrected;
  return record?.baselineVersion === "v2" ? MEASUREMENT_METHOD.qiseCorrected : null;
}
