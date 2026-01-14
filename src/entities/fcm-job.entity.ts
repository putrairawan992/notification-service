import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('fcm_job')
export class FcmJob {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  identifier: string;

  @Column({ type: 'datetime' })
  deliverAt: Date;
}
