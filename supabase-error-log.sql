-- ========================================
-- Error Logging Table - لتسجيل الأخطاء
-- ========================================
-- طريقة التنفيذ: انسخ الكود ده في Supabase SQL Editor وشغله

CREATE TABLE IF NOT EXISTS error_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  component_stack TEXT,
  url TEXT,
  user_agent TEXT,
  user_id UUID REFERENCES users(id),
  timestamp TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE error_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can read error_log" ON error_log FOR SELECT USING (true);
CREATE POLICY "System can insert error_log" ON error_log FOR INSERT WITH CHECK (true);

-- Index for querying by date
CREATE INDEX IF NOT EXISTS idx_error_log_timestamp ON error_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_user ON error_log(user_id);
