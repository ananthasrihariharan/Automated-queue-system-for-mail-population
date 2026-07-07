SELECT DISTINCT "paymentMode", COUNT(*) FROM "Job" WHERE "paymentMode" IS NOT NULL GROUP BY "paymentMode";
