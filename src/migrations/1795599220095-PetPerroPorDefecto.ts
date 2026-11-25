import { MigrationInterface, QueryRunner } from "typeorm";

export class PetPerroPorDefecto1795599220095 implements MigrationInterface {
    name = 'PetPerroPorDefecto1795599220095'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // WOOF: la mascota pasa a ser un perro. Cambia el valor por defecto
        // y convierte las mascotas existentes.
        await queryRunner.query(`ALTER TABLE "pet" ALTER COLUMN "type" SET DEFAULT 'PERRO'`);
        await queryRunner.query(`UPDATE "pet" SET "type" = 'PERRO' WHERE "type" = 'GATO'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "pet" ALTER COLUMN "type" SET DEFAULT 'GATO'`);
    }

}
