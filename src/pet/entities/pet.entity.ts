import { Entity, Column, PrimaryGeneratedColumn, JoinColumn, OneToOne } from "typeorm";
import { User } from "../../users/users.entity";


@Entity('pet')
export class Pet {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({
        type: 'enum',
        enum: ['GATO', 'PERRO'],
        default: 'PERRO',
      })
    type: string;

    @Column({
        type: 'enum',
        enum: ['FELIZ', 'HAMBRIENTO', 'MUERTO'],
        default: 'HAMBRIENTO',
      })
    state: string;
  
    @Column()
    date_creation: Date;
    
    @OneToOne(() => User, (user) => user.pet)
    user: User;
}