ALTER TABLE "StakingPosition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StakingPayout" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "StakingPosition" FROM anon;
REVOKE ALL ON TABLE "StakingPosition" FROM authenticated;
REVOKE ALL ON TABLE "StakingPayout" FROM anon;
REVOKE ALL ON TABLE "StakingPayout" FROM authenticated;
