-- Migration: Add DELETE policy for messages table

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'Users can delete messages in their tenant'
    ) THEN
        CREATE POLICY "Users can delete messages in their tenant"
        ON public.messages FOR DELETE
        USING (tenant_id = public.get_user_tenant_id());
    END IF;
END
$$;
