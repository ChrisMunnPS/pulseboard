'use client';
import { useParams } from 'next/navigation';
import DeviceForm from '@/components/DeviceForm';

export default function EditDevice() {
  const { id } = useParams<{ id: string }>();
  return <DeviceForm id={id} />;
}
