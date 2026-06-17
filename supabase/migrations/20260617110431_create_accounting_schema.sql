CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method TEXT NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE client_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  debit DECIMAL(12,2) DEFAULT 0,
  credit DECIMAL(12,2) DEFAULT 0,
  balance DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_data JSONB,
  new_data JSONB,
  performed_by UUID NOT NULL,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'staff',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO clients (name) VALUES
  ('Saba Traders'),
  ('Hassan & Co'),
  ('Malik Traders'),
  ('Azitma Trading'),
  ('Proskit Trading'),
  ('AZ Traders'),
  ('Hashmi Pvt Ltd'),
  ('Union Traders'),
  ('Ghamkol Traders'),
  ('Awan Trading Company');

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_clients" ON clients FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_clients" ON clients FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_clients" ON clients FOR UPDATE
  TO authenticated USING (true);
CREATE POLICY "delete_clients" ON clients FOR DELETE
  TO authenticated USING (true);

CREATE POLICY "select_expenses" ON expenses FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_expenses" ON expenses FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_expenses" ON expenses FOR UPDATE
  TO authenticated USING (true);
CREATE POLICY "delete_expenses" ON expenses FOR DELETE
  TO authenticated USING (true);

CREATE POLICY "select_transactions" ON client_transactions FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_transactions" ON client_transactions FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_transactions" ON client_transactions FOR UPDATE
  TO authenticated USING (true);
CREATE POLICY "delete_transactions" ON client_transactions FOR DELETE
  TO authenticated USING (true);

CREATE POLICY "select_audit_logs" ON audit_logs FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_audit_logs" ON audit_logs FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "select_user_roles" ON user_roles FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert_user_roles" ON user_roles FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "update_user_roles" ON user_roles FOR UPDATE
  TO authenticated USING (true);
CREATE POLICY "delete_user_roles" ON user_roles FOR DELETE
  TO authenticated USING (true);
